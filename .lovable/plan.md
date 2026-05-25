## Goal

On the candidate/rep profile page, keep the existing global Pulse score (computed from all of the rep's stored answers), and add a second score computed only from questions the current user has answered — mirroring how party alignment is calculated.

## Changes

### 1. New hook: `useCandidatePersonalizedScore(candidateId)`
File: `src/hooks/useCandidatePersonalizedScore.ts`

- Fetches the user's `quiz_answers` (question_ids).
- Fetches `candidate_answers` for that candidate restricted to those question_ids.
- Returns `{ score, answeredCount, matchedCount }` where `score` is the average of the rep's `answer_value` over the intersection, snapped to the nearest discrete bucket (−10, −5, 0, +5, +10) via the existing `calculateEntityScore` / scoring utilities in `src/lib/scoring.ts`.
- Returns `null` when the user is signed out, has no answers, or the rep has no overlapping answers.
- React Query keyed by `['candidate-personalized-score', candidateId, userId]` with the same staleTime conventions as `useCandidateScoreMap`.

### 2. `CandidateScoreCard` — show both scores

File: `src/components/CandidateScoreCard.tsx`

- Add optional prop `personalizedScore?: number | null` and `personalizedCount?: number`.
- When provided and not null, render a small secondary block beside (or under, on mobile) the main score:
  - Label: "Based on your answers"
  - Value formatted with the same `formatScoreText` + `getScoreColor` helpers
  - Subtext: `{matchedCount} of your questions`
- Add a third marker on the spectrum bar for the personalized score (distinct style — e.g. dashed/outline ring) so it's visually distinguishable from the global "Rep" marker and the "You" marker. Hide if null.
- Keep existing global score, match %, and "You" marker untouched.

### 3. `CandidateProfile` page

File: `src/pages/CandidateProfile.tsx`

- Call `useCandidatePersonalizedScore(id)` and pass the result to `<CandidateScoreCard … personalizedScore={…} personalizedCount={…} />` around line 403.
- No change to `resolvedScore`, match logic, or topic comparisons.

## Out of scope

- Top Spenders, comparison cards, party scores, and all other surfaces continue to use the global score map.
- No DB changes, no edge functions, no migrations.
