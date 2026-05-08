# Why McCormac has federal answers

John E. McCormac is the **Mayor of Colonia, NJ** — a local official. Per the project rule, governors and below should only answer the 5 local-scope topics. But his record in `candidate_answers` includes 174 rows across federal topics (Defense, Foreign Affairs, Environment, Civil Rights, Healthcare, Immigration, etc.), including 27 marked as `voting_record` (impossible for a mayor) and 84 marked `inferred`.

## Root cause

In `supabase/functions/get-candidate-answers/index.ts` (lines 1328–1348), the scope filter is only applied when the caller does **not** pass `questionIds`:

```ts
if (questionIds && questionIds.length > 0) {
  questionsQuery = questionsQuery.in('id', questionIds); // scope ignored
} else {
  questionsQuery = questionsQuery.in('topic_id', scopeTopicIds);
}
```

The matching flow (`useRepresentativeScores` → `get-candidate-answers`) always passes the user's quiz `questionIds`, which are federal-scope. So when a user matches against a mayor, the function generates federal answers for that mayor and bypasses the local-only rule entirely. The `populate-civic-answers` function correctly enforces local-only, but it isn't the path that produced these rows.

## Fix plan

### 1. Enforce scope in `get-candidate-answers`
Always compute `scopeTopicIds` for the official, and **intersect** the requested `questionIds` against questions whose `topic_id` is in scope. Out-of-scope question IDs are silently dropped (no answer generated, no row written).

### 2. Skip out-of-scope reps in match scoring
In `useRepresentativeScores`, before invoking `get-candidate-answers`, filter out local officials when the user's quiz contains only federal questions (and vice versa) so we don't waste calls and don't show a misleading "0 shared" score. Reuse `isLocalOfficial` from `src/lib/localOfficeUtils.ts`.

### 3. Clean up existing bad rows
One-off migration / admin script: delete `candidate_answers` rows where the candidate is a local official (from `static_officials` with `level = 'local'`, or candidates whose `office` matches the local keyword list) AND the question's `topic_id` is in a federal-scope topic. Affects ~174 rows for McCormac and likely similar counts for any other civic officials touched by the matching flow.

### 4. Also tighten `batch-populate-answers` / `populate-candidate-answers`
Audit those two functions the same way and add the same scope guard so future runs can't reintroduce the problem.

## Out of scope

- Changing what topics count as local vs federal (the 5/12 split stays).
- UI changes on the rep card — once the data is clean and scope is enforced, the card will naturally show only local topics for McCormac.

## Technical notes

Files to touch:
- `supabase/functions/get-candidate-answers/index.ts` — scope intersection at lines ~1338–1348.
- `supabase/functions/batch-populate-answers/index.ts` — add scope guard.
- `supabase/functions/populate-candidate-answers/index.ts` — add scope guard.
- `src/hooks/useRepresentativeScores.ts` — filter reps by scope before invoke.
- New migration: `DELETE FROM candidate_answers ca USING questions q, topics t, static_officials s WHERE ca.question_id=q.id AND q.topic_id=t.id AND ca.candidate_id=s.id AND s.level='local' AND t.scope='all';`
