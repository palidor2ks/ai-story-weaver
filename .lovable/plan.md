## Plan

Fix the Admin officials list so fetched local officials like Dennis Espinosa appear in the main “Manage Politicians” / answer coverage table, not only the Static Officials tab.

## What I found

- Local officials do exist in `static_officials` and are active.
- The smaller “Static Officials” tab already reads `static_officials`.
- The large Admin coverage table reads `candidates` plus `candidate_overrides`, but it does not include `static_officials`, so fetched local officials are omitted there.

## Implementation

1. Update `src/hooks/useCandidatesAnswerCoverage.ts`:
   - Add `static_officials` as a source for civic officials.
   - Include active local officials from `static_officials` when the Admin coverage table loads civic/local results.
   - Preserve existing party/state/level filters.
   - Deduplicate against existing `candidates` and `candidate_overrides` by candidate ID.
   - Use existing `candidate_answer_coverage_stats` to show answer counts for those local officials.

2. Keep UI unchanged:
   - No layout changes.
   - Existing filters, search, AI research button, and table columns continue to work.

## Scope

- Frontend query logic only.
- No database schema changes.
- No changes to mayor/local official fetching.