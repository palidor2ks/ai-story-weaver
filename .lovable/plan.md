## Goal

Run a batch job that walks every politician in **visible states** (states not in `hidden_states`) and fills in any missing question answers, rep by rep. Each rep's run already covers all 340 questions across every topic via `get-candidate-answers`, so "topic by topic" is covered implicitly.

## Current state

- **Visible states**: FL, NJ, OH, PA, US (98 candidates total).
- **Coverage gap** (out of 340 questions per candidate):
  - FL: 30 pols, ~23/340 avg → very sparse
  - NJ: 22 pols, ~201/340 avg
  - OH: 17 pols, ~184/340 avg
  - PA: 19 pols, ~108/340 avg
  - US: 10 pols, ~67/340 avg
- `batch-regenerate-answers` already exists: runs in background via `EdgeRuntime.waitUntil`, iterates candidates, calls `get-candidate-answers` per candidate with `forceRegenerate:false` (only fills missing), batches with delays, logs progress every 10 reps.
- Today it runs against ALL candidates; it has no state filter.

## Plan

### 1. Add visible-states filter to `batch-regenerate-answers`

In `supabase/functions/batch-regenerate-answers/index.ts`:
- Accept a new param `visibleStatesOnly: boolean` (default `true` for safety) and an optional explicit `states: string[]`.
- Before fetching candidates, query `hidden_states`. Compute the visible set as `candidates.state NOT IN hidden_states` (and intersect with `states` if provided).
- Apply `.not('state', 'in', '(${hiddenList})')` to the candidates query.
- Log the resolved state list at start.

No other logic changes — existing per-rep loop already iterates all questions (and therefore all topics) for that rep, with delays and progress logs.

### 2. Add an admin trigger button

In `src/components/admin/CandidateAnswersDialog.tsx` or the existing answers admin tab (whichever houses `batch-populate-answers` controls — confirm during build), add a "Backfill answers (visible states)" button that calls:

```ts
supabase.functions.invoke('batch-regenerate-answers', {
  body: { visibleStatesOnly: true, batchSize: 5, delayBetweenCandidates: 3000 }
})
```

Show a toast pointing to the Edge Function logs (job runs in background, ~minutes).

### 3. Verify

- Trigger with `maxCandidates: 2` first as a smoke test.
- Tail logs at https://supabase.com/dashboard/project/ornnzinjrcyigazecctf/functions/batch-regenerate-answers/logs to confirm it skips hidden states and processes only FL/NJ/OH/PA/US.
- Re-query `candidate_answers` count per candidate to confirm it climbs toward 340.

## Out of scope

- Strict topic-by-topic ordering (each rep's run already covers all topics).
- Re-generating already-answered questions (uses `forceRegenerate:false`).
- Changing the AI prompt or scoring logic.

## Open questions

1. Should the backfill skip candidates already at 100% coverage automatically? (Current behavior: yes — `candidatesWithMissing` filter already does this.)
2. Run for all visible states in one go (~98 reps × ~250 missing answers ≈ multi-hour job), or cap with `maxCandidates` and run in chunks?