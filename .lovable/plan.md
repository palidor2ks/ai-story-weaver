# Fix Overall Coverage exceeding 100%

## Problem

The "Overall Coverage" card on the admin sync page shows **158,024 / 153,361 answers (103%)**. The numerator counts every row in `candidate_answers` (including answers tied to local-scope topics like housing/public safety), while the denominator is `candidates × federal questions only`. The two sides measure different universes, so the ratio can exceed 100%.

Confirmed in the DB:
- Total answers: 158,692
- Federal-scope answers: 144,292
- Federal questions: 251 (of 351 total)
- Candidates: 611 → denominator 611 × 251 = 153,361 ✓

## Fix

In `src/hooks/useSyncStats.ts`, change the `totalActualAnswers` query so it only counts answers whose question belongs to a federal-scope topic. The simplest approach: reuse the existing `topic_answer_counts` aggregated view (already fetched) and sum only the rows whose `topic_id` is in the federal topic set. This avoids a second round-trip and a large `.in(...)` filter on 251 question IDs.

Concretely:

1. Remove the standalone `answersCountResult` query (or keep it only for a separate "all answers" stat if needed elsewhere — currently it isn't).
2. After building the `federalTopicIds` set, compute:
   ```ts
   const totalActualAnswers = (topicAnswerCountsResult.data || [])
     .filter(r => r.topic_id && federalTopicIds.has(r.topic_id))
     .reduce((sum, r) => sum + (Number(r.answer_count) || 0), 0);
   ```
3. Use that value for `overallCoveragePercent`.

This guarantees numerator and denominator are both scoped to federal topics, so the bar maxes out at 100%.

## Verification

- Reload `/admin` sync panel: Overall Coverage should now read ~144,292 / 153,361 (~94%) and the bar should never exceed 100%.
- Per-topic coverage rows (already federal-scoped) should be unchanged.

## Out of scope

- No change to local-scope answer storage or to candidate/question data.
- No DB migration required.
- Per-candidate coverage panel is unaffected (uses a different hook).
