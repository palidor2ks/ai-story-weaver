
# Add AI Summaries Per Politician to Quiz Results Page

## Problem
The Quiz Results page (`/results`) shows representatives with a basic inline `RepresentativeCard` that only displays name, office, party, and score. It lacks the AI-generated comparison summaries that the User Profile page (`/profile`) provides via `RepresentativeComparisonCard`.

## Changes

### 1. Replace inline RepresentativeCard with RepresentativeComparisonCard in QuizResults.tsx

- Import `RepresentativeComparisonCard` from `@/components/RepresentativeComparisonCard`
- Import `useCandidateScoreMap` hook (already used in UserProfile) to resolve scores for officials
- Remove the inline `RepresentativeCard` component definition (lines ~213-251)
- Replace all `<RepresentativeCard>` usages in the representatives section with `<RepresentativeComparisonCard>` — for federal executive, U.S. Congress, state executive, state legislative, and local officials
- Pass `resolvedScore` using the same `getResolvedScore` pattern from UserProfile
- This automatically gives each politician card the AI comparison summary, match percentage, and expandable details

### 2. Add score resolution logic

- Collect all official IDs (from `civicData` and `federalReps`) into an array using `useMemo`
- Call `useCandidateScoreMap(allOfficialIds)` to fetch saved scores
- Add `getResolvedScore` helper (same as UserProfile)

### 3. Remove unused code

- Remove the `politicianMatches` state and `generateMatchReason` function (lines ~29-165) — these are replaced by the per-card AI comparisons
- Remove the "Top Politician Matches" card that used the old `candidates` data — it showed generic matches from all candidates, not the user's actual representatives
- Remove `useCandidates` import if no longer needed
- Clean up unused state variables (`isLoadingMatches`, `politicianMatches`)

### What stays the same
- Overall Score card
- Party Alignment card
- AI Profile Summary card
- Topic Breakdown card
- Share functionality
- CTA button at bottom

### Technical details
- `RepresentativeComparisonCard` accepts `{ official: CivicOfficial, resolvedScore: number | null }` — same props pattern used in UserProfile
- The component internally handles fetching/generating AI comparison summaries via `useRepComparison` and `useGenerateRepComparison` hooks
- No new edge functions or database changes needed — all infrastructure already exists
