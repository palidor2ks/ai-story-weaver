# Personalized Rep Score (Apples-to-Apples)

## Goal
The score badge shown next to each representative on quiz results and profile pages should reflect the rep's average answer **only across the questions the user actually answered**, not the rep's global overall score.

## Changes

### 1. New hook: `src/hooks/usePersonalizedScoreMap.ts`
- Inputs: list of candidate/official IDs + user's answered `question_id`s.
- Query `candidate_answers` for those candidates filtered to those question IDs.
- For each candidate, average `answer_value` (snap to -10..+10 scale, 2 decimals) using `calculateEntityScore` from `@/lib/scoring`.
- Return `Map<candidateId, { score: number; answeredCount: number; matchedCount: number }>`.
- Skip (return null) for any candidate with 0 overlapping answers — caller falls back to NA.

### 2. `src/pages/QuizResults.tsx`
- Fetch user's quiz `question_id`s (already loaded for scoring; reuse).
- Call new `usePersonalizedScoreMap(allOfficialIds, userQuestionIds)`.
- Replace `getResolvedScore` body so it returns the personalized score first, then falls back to `null` (NA) when no overlap exists. The global `useCandidateScoreMap` is no longer used for the badge here.

### 3. `src/pages/UserProfile.tsx`
- Same swap: use `usePersonalizedScoreMap` instead of `useCandidateScoreMap` for the rep card badges in the "My Representatives" sections.

### 4. Leave untouched
- `CandidateProfile.tsx` continues to show the rep's overall/global score (that page is about the rep, not the comparison).
- `RepComparisonSummary` / `useRepComparison` already works on overlapping answers — no change.
- Discrete-value rules and L1–R10 display format preserved (uses existing `ScoreText`).

## Technical notes
- Local officials (mayor, governor, etc.) answer only the 5 local-scope topics, so federal quiz questions will yield 0 overlap → they'll correctly show NA on the federal results page. That matches the existing scope rule.
- Cache key: `['personalized-score-map', sortedCandidateIds, sortedQuestionIds]`, staleTime 2 min, matching current pattern.
