## Why PR #66 looks broken

PR #66 only fixed the **candidate** answer text path (mapping `answer_value` → option text while ignoring skip options). It did not touch the **user's** answer text, which is fetched verbatim from `quiz_answers.selected_option.text`. When a user chose "Not important to me" (the skip option, value `0`), that literal string still renders in the "Your answer" block of every expanded candidate position — which is what makes it feel like the fix didn't land.

A second, latent gap: `useCandidateAnswersForUser` in `src/hooks/useCandidateAnswers.ts` is the only candidate-answer query the PR did not extend with `is_skip_option`. The hook is currently unused but should be aligned to prevent regressions.

## Fix

1. `src/components/CandidatePositions.tsx`
   - In the `user-quiz-answers-for-comparison` query, also select `selected_option.is_skip_option` and `selected_option.value`.
   - When building `userAnswerMap`, set `text` to `null` whenever `selected_option.is_skip_option === true` (so downstream components fall back to nearest substantive option text, or hide the quote entirely).

2. `src/components/CompactPositionRow.tsx`
   - In the "Your answer" block, if `userAnswerText` is empty/skip, fall back to `getAnswerText(userAnswer)` (which already filters skip options) so the user sees the equivalent substantive label like "Neutral—support modest increases." instead of "Not important to me". If no substantive option exists, render only the numeric badge.

3. `src/components/CandidateAnswerCard.tsx`
   - Same treatment in the "Your answer" block (line ~184): prefer `userAnswerText` only when it is not the skip label; otherwise fall back to `getAnswerText(userAnswer, true)?.text`.

4. `src/hooks/useCandidateAnswers.ts`
   - Add `is_skip_option` to the `question_options` embed inside `useCandidateAnswersForUser` so all three fetchers are consistent.

## Out of scope

- No DB migration: the `is_skip_option` column already exists and data is correctly flagged (verified via query).
- No changes to admin dialog or party comparison card — those already either handle the skip sentinel or fetch a single option.
- No score recomputation: `answer_value` semantics are unchanged.

## Verification

- On `/candidate/S4NJ00524`, expand a Technology question where the user answered "Not important to me". The "Your answer" line should now read the nearest substantive label (e.g. `"Neutral—…"`) or just the numeric badge, never `"Not important to me"`.
- Candidate quote line continues to show the substantive option text (unchanged behavior from PR #66).
