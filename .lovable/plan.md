## Goal

On the Quiz Results page, after the existing "Your Representatives" section, also show the **candidates running in the user's upcoming elections** with the same match-comparison card UI used for sitting representatives.

## What exists today

- `useUpcomingElections(address)` already returns `{ federal, state, local }` arrays of `UpcomingElection`, each with a `candidates: UpcomingCandidate[]` list (name, party, office, score, etc.).
- `RepresentativeComparisonCard` accepts a `CivicOfficial` shape and a resolved score, and renders the per-user match summary.
- `QuizResults.tsx` uses `useCandidateScoreMap(allOfficialIds)` to resolve user-personalized scores.

## Changes (frontend only)

### 1. `src/pages/QuizResults.tsx`
- Import `useUpcomingElections` and call it with `profile?.address`.
- Flatten all upcoming-election candidates and add their IDs to `allOfficialIds` so `useCandidateScoreMap` resolves their personalized scores too.
- Add a new section **"Candidates on Your Ballot"** directly under the "Your Representatives" card, grouped by federal / state / local:
  - For each upcoming election, render a small heading (`"{election.name} — {formatted date}"`).
  - Underneath, render one `RepresentativeComparisonCard` per candidate.
  - Map each `UpcomingCandidate` into the `CivicOfficial` shape the card expects (id, name, office, party, image_url, overall_score, level, state, is_incumbent, coverage_tier, confidence).
  - Skip a candidate if they're already shown in the "Your Representatives" block above (dedupe by id and by `name::office` key, reusing the same normalization as `useUnifiedCandidates.unifiedCandidateNameKey`).
- If no upcoming elections, render nothing (no empty state needed — Representatives section already covers the address-missing case).
- Show the same "Finding candidates…" loader pattern while the hook is loading.

### 2. No backend, no schema, no edge function changes
- Data already comes from the existing `fetch-upcoming-elections` flow.

## Validation
- For a user with address in NJ-06 (current state): after taking the quiz, `/quiz-results` should show:
  - Existing reps (Booker, Kim, Pallone, etc.)
  - New "Candidates on Your Ballot" section listing the 2026 NJ Senate race candidates and the 2026 NJ-06 House race candidates (Pallone deduped because already in Reps).
- For a user without an address, the new section is hidden (Representatives card already prompts them to add one).

## Out of scope
- Listing opponents on the candidate profile page (separate plan).
- Changing how/when elections are fetched.
