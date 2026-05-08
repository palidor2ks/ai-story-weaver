## Goal

State and local officials (governor and below) should only deal with the 5 **local-scope** topics — never the 12 federal-scope topics. Today, several places still show or count all 17 topics for them, which is why the admin answer-management dialog lists 340 questions.

## Current behavior

- Edge function `get-candidate-answers` already restricts local officials to `scope='local'` ✓
- Edge function `populate-civic-answers` already loads only local-scope questions ✓
- DB function `calculate_coverage_tier` already uses local-scope total for local officials ✓
- **Bug 1**: `CandidateAnswersDialog` (admin) does the *opposite* — local officials see all 17 topics; federal officials see only the 12.
- **Bug 2**: Admin coverage table denominator (`/340`) uses the global total for everyone, including state/local — should be the local-question count for them.
- **Bug 3**: Politician self-service dashboard and any score/onboarding paths that load "all questions" don't gate by official scope.
- **Data**: Some state/local candidates already have federal-scope answers stored from earlier runs.

## Changes

### 1. Admin `CandidateAnswersDialog` (src/components/admin/CandidateAnswersDialog.tsx)
Flip the topic filter so local officials see `scope='local'` only and federal officials see `scope='all'` (current federal behavior preserved). Remove the "see all 17" branch.

### 2. Admin coverage denominator (src/hooks/useCandidatesAnswerCoverage.ts)
Compute two totals up front: `federalTotal` (questions in `scope='all'`) and `localTotal` (questions in `scope='local'`). For each row, pick the denominator based on `isLocalOfficial(office)` so the admin table shows e.g. `5/40` instead of `5/340` for local officials.

### 3. Politician self-edit dashboard (src/pages/PoliticianDashboard.tsx)
Filter `questions` to local-scope only when the claimed candidate is a local official; otherwise federal-scope only. (Same `isLocalOfficial` helper.)

### 4. `useCandidateTopicQuestions` (src/hooks/useCandidateTopicQuestions.ts)
No change — already scoped per topic_id.

### 5. Cleanup of stale federal answers for state/local officials
One-time migration: delete rows from `candidate_answers` where the candidate is a local official (per `candidates.office` / `candidate_overrides.office`) **and** the question's topic is `scope='all'`. This removes leftover federal answers that should never have been generated for them.

### 6. Update memory rule
Replace the existing core rule "Local topics only for governor+below" with the stricter version: **"Governor and below answer ONLY the 5 local-scope topics. Federal officials answer ONLY the 12 federal-scope topics."**

## Out of scope

- No changes to topic definitions or question content.
- No changes to the user/voter quiz flow (Onboarding already separates federal vs local quiz sections).
- No UI redesign — just correct filtering and denominators.

## Open question

The screenshot shows totals like `28/340` for NJ candidates. After the fix, those denominators will drop to whatever the local question count is (likely ~30-50). Confirm at implementation time and we'll show the actual number.
