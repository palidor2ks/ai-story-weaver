
# Fix Duplicate Trump & Score Mismatch

## Problem

There are **two Trump records** appearing on the Candidates page:
1. `P80001571` ("Donald J. Trump") from the `candidates` table — has 160 AI answers and a stored `overall_score` of 4.13
2. `federal_president` ("Donald Trump") from the `static_officials` table — no answers, no stored score

These have different IDs, so the deduplication logic (which checks by `id`) doesn't catch it. The score mismatch between Feed and Candidate Profile pages is caused by:
- **Feed page**: Uses `useCandidateScoreMap` which returns the DB score (4.13), then `useRepresentativeAnswersAndScores` calculates a different `overallScore` from only the questions the user has answered (producing ~4.43)
- **Candidate Profile page**: Shows `candidate.overall_score` directly from the DB (4.13)

## Plan

### 1. Fix duplicate: Link static_officials President to candidates table ID

In `useCivicOfficials` (or wherever civic officials are transformed), add logic to detect when a `static_officials` record matches a `candidates` record and use the `candidates` ID instead. This ensures deduplication works correctly.

Specifically, when a civic official has the role "President" or matches a known candidate by name, map their ID to the `candidates` table ID (`P80001571`). Since the `candidates` entry has richer data (answers, scores, topic scores), the dedup in `Candidates.tsx` will prefer the `candidates` version (which is added to `federalExecutiveCandidates` first).

### 2. Fix score consistency: Use scoreMap on Candidate Profile page

The Candidate Profile page should also use `useCandidateScoreMap` to display the overall score, ensuring consistency with the Feed page. Both pages will then show the same score for the same candidate.

### 3. Update the DB stored score to match calculated score

Run a one-time update to sync `candidates.overall_score` with the calculated average from `candidate_answers` (currently 4.13 in DB vs 4.125 calculated). This keeps the stored value accurate.

## Files to change

- `src/hooks/useCivicOfficials.ts` — Map `federal_president` ID to the candidates table ID when a match exists
- `src/pages/CandidateProfile.tsx` — Use `useCandidateScoreMap` for score display consistency
- `src/pages/Feed.tsx` — Ensure the overallScore from `useRepresentativeAnswersAndScores` is not overriding the DB score (the `overallScore` field should come from `useCandidateScoreMap`, not from the match-score calculation)
