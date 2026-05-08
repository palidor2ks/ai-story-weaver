# Speed up Answer Management dialog

## Problem

Clicking "Answers" for a candidate opens `CandidateAnswersDialog`, which currently takes several seconds to render. The data fetch in `useCandidateAnswersByTopic` (`src/components/admin/CandidateAnswersDialog.tsx`, ~lines 96–198) is the bottleneck.

## Root causes

The hook performs **5 round-trips, almost all sequential**:

1. `await supabase.from('candidates').select('office')…`
2. If no office → `await supabase.from('candidate_overrides').select('office')…`
3. `await supabase.from('topics').select(...).eq('scope', …)`
4. `await supabase.from('questions').select('id, text, topic_id, question_options(value, text)')` — **no filter**, returns ALL questions across ALL topics (federal + local, ~340 rows) plus the nested `question_options` join, even though only ~60 of them belong to the topics this candidate cares about.
5. `await supabase.from('candidate_answers')...eq('candidate_id', candidateId)`

Each await blocks the next. The questions query is the heaviest (full table + nested join) and is run for every dialog open. There is no `staleTime` benefit across candidates because the cache key is per-candidate, and questions/topics rarely change.

## Fix

Refactor `useCandidateAnswersByTopic` to:

1. **Parallelize the office lookup**: run `candidates` and `candidate_overrides` selects in `Promise.all`, take whichever returns a non-null `office`.
2. **Parallelize topics + answers + office** in a single `Promise.all`. (`topics`, `candidate_answers`, and the office lookup are all independent.)
3. **Filter `questions` by `topic_id`**: after `topics` resolves, fetch questions with `.in('topic_id', topicIds)`. This drops the payload from ~340 rows to ~60 (local) or ~240 (federal) and skips unrelated `question_options`.
4. **Cache topics/questions across candidates**: split topics+questions into a separate `useQuery(['topics-with-questions', scope], …, { staleTime: 5 * 60_000 })` keyed by scope (`'all'` vs `'local'`). Compose with the per-candidate answers query. This makes second/third dialog opens essentially instant — only the small `candidate_answers` fetch runs.
5. Keep the existing `staleTime: 30_000` on the per-candidate query so reopening the same candidate within 30s is instant.

No schema changes, no UI changes, no behavior changes — same data, same shape, same scope filtering rules. Only `src/components/admin/CandidateAnswersDialog.tsx` is touched.

## Expected impact

- First open of any candidate in a session: ~1 round-trip pair instead of 5 sequential round-trips.
- Subsequent opens (any candidate, same scope): only the small `candidate_answers` query runs (~50–200ms).
- Payload for the heavy `questions` query shrinks 4–5× because it's filtered to relevant topics only.
