## Confirmed: the C (0.00) is wrong

For profile `Rajae Eltemawi` (id `dee436f4`), the database has these per-topic scores and weights:

| Topic | Score | Weight |
|---|---|---|
| Economy & Work | -5.00 | 5 |
| National Security & Borders | 0.00 | 4 |
| Health, Education & Welfare | -7.50 | 3 |
| Local Cost of Living | 0.00 | 2 |
| Local Housing | -5.00 | 1 |

Weighted overall = (-5·5 + 0·4 + -7.5·3 + 0·2 + -5·1) / 15 = **-3.50** → should display **CL3.50 (Center-Left)**, not C.

The stored `profiles.overall_score = 0.00` is stale/incorrect.

## Root cause

In `src/pages/Quiz.tsx`, `calculateUserScoreFromAnswers()` (line 160) builds the overall score from the in-memory `quizAnswers` state, which only holds answers entered in the **current quiz session** (e.g. the 6 questions from "Answer More Questions" or one topic quiz). When `handleComplete` saves results, `save_quiz_results` RPC overwrites `profiles.overall_score` with that subset-only weighted average.

The per-topic table (`user_topic_scores`) is upserted, so it accumulates correctly across sessions — but the overall score does not. After any partial quiz with near-neutral answers, the overall snaps toward 0 and stops matching the topic breakdown.

`src/pages/Onboarding.tsx` (full onboarding flow) works correctly because all answers are in state at completion.

## Fix

Recompute the overall score from the **full set of stored answers + topic scores**, not just the current session.

### 1. `src/pages/Quiz.tsx`
- In `calculateUserScoreFromAnswers`, merge the freshly-answered `quizAnswers` with the user's existing stored quiz answers (fetch full rows, not just `question_id`, in the existing `quiz_answers` query) before calling `calculateQuizScore`. Newest answers for the same `questionId` win.
- This way the saved `overallScore` reflects every answer the user has given, weighted by their selected topics.

### 2. Backfill the affected profile(s)
Add a one-off migration (or RPC) that recomputes `profiles.overall_score` for all users from `user_topic_scores` × `user_topics.weight`. Same formula as `calculateWeightedOverallScore`. This corrects existing stale values like Rajae's 0.00 → -3.50.

### 3. (Defense in depth) Update `save_quiz_results` RPC
After upserting topic scores, recompute `overall_score` server-side from `user_topic_scores` joined with `user_topics` weights, so any future client that passes a subset-only score still gets corrected. Then ignore the client-provided `p_overall_score` (or keep it as a fallback when the user has no `user_topics` set).

## Verification
- After fix + backfill: Rajae's profile should display **CL3.50** with the same per-topic scores.
- Re-run an "Answer More Questions" session with neutral answers and confirm overall stays consistent with the topic breakdown.
