## Goal

Make every candidate card (and the candidate profile header) read from one shared resolver so the same person looks identical on `/feed`, `/candidates`, `/profile`, `/quiz/results`, and `/candidate/:id`.

## What I found — the same person shows different data per page

Each page builds its own `Candidate` object from a different mix of sources, with a different dedup/priority rule:

| Page | Data sources combined | Priority rule | Notable extras / omissions |
|---|---|---|---|
| `/candidates` (`Candidates.tsx`) | `useCandidates` (DB) + `useAllPoliticians` + `useRepresentatives` + `useCivicOfficials` + `useCandidateScoreMap()` | **DB first**, then Congress, then civic | Civic transform drops `transitionStatus`, `newOffice`, `inaugurationDate`, `level`, `matchScore`, `hasAIAnswers`, `answerCount` |
| `/feed` (`Feed.tsx`) | `useCandidates` + `useRepresentatives` + `useCivicOfficials` + `useCandidateScoreMap` + `useRepresentativeAnswersAndScores` | **API first**, DB only swapped in when DB has a non-zero `overall_score` | Adds `matchScore`, `hasAIAnswers`, `answerCount`, `level`, transition fields. Excludes civic rows whose name matches a Congress member. No `useAllPoliticians`. |
| `/profile` (`UserProfile.tsx`) | `useRepresentatives` + `useCivicOfficials` + `useCandidateScoreMap(ids)` | **API only** (no DB merge) | No `topicScores`, no DB image override on legislators, no match score |
| `/quiz/results` (`QuizResults.tsx`) | Same as `/profile` | API only | Same omissions |
| `/candidate/:id` (`CandidateProfile.tsx`) | `useCandidate(id)` (DB) + `useRepresentativeDetails(id)` + `useCandidateScoreMap([id])` | **DB only** | DB-only image, party, office; never falls back to API row if DB row missing |

### Concrete fields that diverge for the same id/name

- **`imageUrl`** — `/candidates` prefers DB row; `/feed` prefers Congress/civic API URL (DB only wins when score>0); `/profile` always API; `/candidate/:id` always DB. Result: one person can show 3 different photos.
- **`overallScore`** — `/candidates` reads `scoreMap` for *both* reps and civic; `/feed` skips `scoreMap` on the initial transform and re-applies it in a second `useMemo`; `/profile` only reads `scoreMap` for ids in its memoized list; `/candidate/:id` uses a custom `resolvedScore`. Race conditions cause "0.00" on one page while another shows a real score.
- **`coverageTier` / `confidence`** — DB on Candidates (when matched) vs API on Feed/Profile. A Tier 1 in DB shows as Tier 3 (default) on Feed/Profile until the DB merge kicks in.
- **`isIncumbent`** — Candidates (DB) vs Feed/Profile (API). Differs whenever Open States returns a different active flag than the DB row.
- **Transition badges (`transitionStatus`, `newOffice`, `inaugurationDate`)** — set on Feed only; `/candidates`'s `transformCivicToCandidate` drops them, so the orange "transitioning" arrow never appears on the Candidates page.
- **`level`** — only Feed sets it on the Candidate object; other pages can't filter by federal/state/local consistently.
- **AI-match indicators (`matchScore`, `hasAIAnswers`, `answerCount`)** — only Feed sets them, so the Sparkles ✨ icon and "AI-predicted" tooltip never show on Candidates, Profile, or Quiz Results, even for the same person.
- **Dedup keys differ** — Feed excludes civic rows by lowercase name match against Congress; Candidates excludes by `normalize(name)+normalize(office)`; Profile/Results don't dedup at all, so a senator can appear twice if civic and Congress both return them.
- **`topicScores`** — only populated when the DB row wins the merge; on Feed/Profile most cards have `topicScores: []`.

### Why this happens
Each page hand-rolls its own `transformRepToCandidate`, `transformCivicToCandidate`, and `dbTransformed` plus its own merge order. There is no single source of truth that says "given this id (bioguide / civic / DB), here is the canonical Candidate object."

## Fix

### 1. New shared resolver `src/hooks/useUnifiedCandidates.ts`
A single hook that returns `{ byId, all, myReps, federalExec, congress, stateExec, stateLeg, local }` of fully-populated `Candidate` objects. It internally calls `useCandidates`, `useAllPoliticians`, `useRepresentatives(address)`, `useCivicOfficials(address)`, `useCandidateScoreMap(ids)`, and `useRepresentativeAnswersAndScores(...)`, then runs one merge with this fixed priority for every field:

```text
overallScore       : scoreMap → DB.overall_score → API.overall_score → 0
imageUrl           : DB.image_url → candidate_overrides.image_url → API.image_url
coverageTier       : DB → API → 'tier_3'
confidence         : DB → API → 'medium'
party/office/state : DB → API
isIncumbent        : DB → API → true
transition fields  : civic API (only source)
topicScores        : DB → []
level              : derived from office + civic level
matchScore /
hasAIAnswers /
answerCount        : useRepresentativeAnswersAndScores (always run)
```

Dedup uses one normalized key (`normalize(name) + '::' + normalize(office)`) plus id-collision guards. The civic-vs-Congress collision rule lives here only.

### 2. Refactor the four pages to consume the resolver
- `Feed.tsx` — drop the local `congressCandidates` / `civicCandidates` / `dbTransformed` build; render groups from `myReps` + `federalExec` + `congress` + `stateExec` + `stateLeg` + `local` returned by the hook.
- `Candidates.tsx` — drop `transformRepToCandidate` / `transformCivicToCandidate` / `dbTransformed` / `allCandidates` / `myRepsCombined` and use the same hook outputs. Tabs map directly to hook buckets.
- `UserProfile.tsx` and `QuizResults.tsx` — replace their inline civic/rep maps with `byId` lookups so AI-match indicators and DB photos/tiers appear here too.

### 3. Align CandidateProfile header
`CandidateProfile.tsx` reads only DB. Add a fallback so when `useCandidate(id)` returns nothing it pulls the matching row from the same resolver (via id), keeping name/photo/party/coverage consistent with the card the user clicked on.

### 4. Verify
- Pick three people who currently differ (Trump `P80001571`, Vance `V000137`, and one senator with a DB row) and screenshot `/feed`, `/candidates`, `/candidates → My Reps`, `/profile`, `/quiz/results`, `/candidate/:id`. Confirm photo, score, coverage tier, confidence, incumbent flag, transition badge, and AI-sparkle are identical on every page.
- Bump the relevant React Query cache keys (`'candidate-score-map'`, `'civic-officials'` v8 → v9) so users pick up the unified data without a hard refresh.

### Out of scope
No DB schema changes. No edge-function changes (the recent `fetch-civic-officials` DB-image merge stays). All work is frontend hook + page refactor.
