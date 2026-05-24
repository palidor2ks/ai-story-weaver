# Pin topic, question number, progress, and question text during the onboarding quiz

Today the topic chip (in `Onboarding.tsx`) and the "Question N of M" + progress bar + question text (all in `QuizQuestion.tsx`) live at the top of the scroll area, so they scroll out of view while the user reads/picks answer options.

## Changes

1. **`src/components/QuizQuestion.tsx`**
   - Add `hideHeader?: boolean` prop. When true, do not render the internal "Question N of M" + progress bar row.
   - Restructure the card so the question's `<h2>` text can also be hoisted out: add `hideQuestionText?: boolean` prop. When true, skip the `<h2>` inside the card and render only the answer options.

2. **`src/pages/Onboarding.tsx`** (both `case 'quiz'` and `case 'local_quiz'`)
   - Wrap topic chip + question-number/progress row + the question `<h2>` text in one sticky container at the top of the quiz view:
     - `sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border pt-3 pb-4 -mx-4 px-4`
     - Inside, stack: topic icon + name → progress row → question text.
   - Pass `hideHeader` and `hideQuestionText` to `<QuizQuestion>` so nothing is duplicated.

3. No state/logic changes; purely a layout refactor on the two quiz steps.

Result: as the user scrolls long answer lists, the topic, "Question 4 of 12", progress bar, and the question itself all stay pinned at the top.
