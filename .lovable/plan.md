Make the "Answer All Questions" button mirror the per-topic button's Start / Continue / Review behavior based on overall progress.

### 1. `src/pages/QuizLibrary.tsx`
- Replace the hardcoded `Start` label on the "Answer All Questions" button with:
  - `Start` when `totalAnswered === 0`
  - `Continue` when `0 < totalAnswered < totalQuestions`
  - `Review` when `totalAnswered === totalQuestions`

### 2. `src/pages/Quiz.tsx` (full-quiz resume)
- In the `questions` memo, when there is no `topicFilter` and `mode !== 'random'` (the full-quiz path), prefer unanswered questions first using the same pattern already used for topic mode:
  - `const unanswered = allQuestions.filter(q => !existingAnswers.includes(q.id));`
  - `filtered = unanswered.length > 0 ? unanswered : allQuestions;`
- This makes "Continue" actually resume at the first unanswered question, and "Review" still works (falls back to all when none unanswered).

No schema, scoring, or other UI changes.
