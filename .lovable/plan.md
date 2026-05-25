## Problem

On the Quiz Library, tapping "Retake" on a partially-answered topic (e.g. Economy & Work 2/41) restarts the topic from question 1 and shows already-answered questions again. Progress is also only persisted when the user reaches the end and taps "Save". If they drop off mid-quiz, all in-session answers are lost.

## Goal

- Topic quizzes resume from the first unanswered question.
- Each answer is saved as soon as it's selected, so partial progress is never lost.
- The button label reflects state: Start / Continue / Review.

## Changes

### 1. `src/pages/QuizLibrary.tsx` — button label
- `answeredCount === 0` → "Start"
- `0 < answeredCount < questionCount` → "Continue"
- `answeredCount === questionCount` → "Review"
- (Behavior unchanged for the top "Answer All Questions" card — it already navigates to `/quiz`.)

### 2. `src/pages/Quiz.tsx` — resume + autosave for topic mode
- When `topicFilter` is set, filter the question list to **unanswered** topic questions first. If all are answered, fall back to the full topic list (review mode).
- Use `existingAnswers` (already fetched) to do the filtering; topic mode currently ignores it.
- On each `handleOptionSelect`, upsert that single row into `quiz_answers` immediately (in addition to local `quizAnswers` state). This is the autosave.
- At the end of the quiz, the existing `saveQuizResults` call still runs to recompute and persist the topic score + overall score. The per-answer upsert above only writes the raw answer row, so the existing mutation remains the source of truth for `user_topic_scores` and `profiles.overall_score`.
- Invalidate the `['answered_questions', user.id]` and `['quiz_answers', user.id]` queries after each autosave so the library count updates live.

### 3. New tiny hook `useUpsertQuizAnswer` in `src/hooks/useProfile.ts`
- Mutation that upserts one row into `quiz_answers` keyed by `(user_id, question_id)`.
- Used by Quiz.tsx on every selection.
- Errors are toasted but do not block UI advance (local state still moves forward).

## Out of scope

- The "Answer All Questions" full-quiz flow keeps current behavior (no filter), since it's already meant to be a comprehensive run. We can extend the same resume logic there in a follow-up if you want.
- No schema migration needed — `quiz_answers` already has a unique `(user_id, question_id)` constraint used by the end-of-quiz save.
- No changes to scoring math, topic weights, or the Quiz Results screen.
