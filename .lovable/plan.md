
# Add "Fill Unanswered" Button in Answer Management

## What
Add a button next to the existing "Regenerate Topic" button that only sends unanswered questions (where `answerValue === null`) to the edge function, skipping already-answered ones.

## Changes

### `src/components/admin/CandidateAnswersDialog.tsx`
1. Add a new handler `handleFillUnanswered` that filters `selectedTopic.questions` to only those with `answerValue === null`, then calls `get-candidate-answers` with just those question IDs (without `forceRegenerate`).
2. Add a "Fill Unanswered" button in the topic header bar (line ~536-548), next to the existing "Regenerate Topic" button. Disabled when there are no unanswered questions or when a job is running.
3. Track a separate loading state (`fillingTopicId`) for this button.

No edge function changes needed — `get-candidate-answers` already supports receiving specific `questionIds` without `forceRegenerate`.
