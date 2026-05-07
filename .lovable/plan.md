
## Problem

The admin "Answers" column shows `X/340` for **all** candidates. But 340 is only correct for local officials (governor+below) who get all 17 topics. Federal legislators should show `X/240` (12 federal topics × 20 questions).

The root cause is in `src/hooks/useCandidatesAnswerCoverage.ts`:
- Line 160-162: fetches a single `totalQuestions` count from ALL questions (340) with no scope filter
- Line 456 and 572: uses this same 340 for both federal and civic candidates

The database function `calculate_coverage_tier` already handles this correctly with scope-aware counting, but the frontend hook doesn't.

## Fix

**File: `src/hooks/useCandidatesAnswerCoverage.ts`**

1. Fetch TWO question counts in parallel:
   - `federalQuestions`: count where topic scope = 'all' (240)
   - `allQuestions`: count of all questions (340)

2. For federal candidates (lines ~395-456): use `federalQuestions` as their `totalQuestions`

3. For civic officials (line ~572): use `allQuestions` as their `totalQuestions`

4. In `useCandidateAnswerStats` (line ~648): same pattern — use scope-aware counts for percentage calculations

5. `makeCivicCoverage` already accepts `totalQuestions` as a parameter, so we just pass the right value.

This keeps the existing architecture and just passes the correct denominator based on candidate type.
