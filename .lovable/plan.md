# Personalize Rep Scores on the Feed

## Context
The previous change swapped to a personalized score (rep's avg over only the questions the user answered) on **QuizResults** and **UserProfile**. The **Feed** page (`/feed`) — which is what the user is currently viewing — still renders `candidate.overallScore` directly from the candidates table, so the badge shown via `CandidateCard` still displays the rep's global score.

## Changes

### 1. `src/pages/Feed.tsx`
- Collect all candidate IDs from `transformedCandidates`.
- Call `usePersonalizedScoreMap(allIds)` (existing hook).
- When building each transformed candidate, set `overallScore` to `scoreMap.get(id) ?? null` instead of `c.overall_score ?? 0`. Allow `null` to mean "NA".
- Update the match-score sort/`bestMatch` calculation to skip candidates whose personalized score is `null` (treat as unscored, don't fake 0).

### 2. `src/components/CandidateCard.tsx`
- Allow `overallScore` to be `number | null`. When `null`, render the same NA `Badge` used in `RepresentativeComparisonCard` instead of `<ScoreText score={0} />` (which would misleadingly read as Center).
- Update the prop/type signature accordingly; keep all other layout unchanged.

### 3. Type adjustment
- In `src/types/index.ts`, change `Candidate.overallScore` to `number | null` (small ripple; most call sites already coalesce). Audit other components that read `overallScore` and add `?? null` / NA fallback where rendered, or `?? 0` where only used in math (match-score helpers).

## Out of scope
- `CandidateProfile.tsx` continues to show the rep's global score (that page is about the rep, not the user-vs-rep comparison).
- No changes to scoring math, AI generation, or DB.
