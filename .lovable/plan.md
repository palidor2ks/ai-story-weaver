## Fix "Fill Unanswered in View" button

The button is disabled and shows (0) because it only counts candidates with `answerCount === 0`. Every visible row has 243/251 answers, so none match. The intent is to fill the remaining missing answers, including for partially-covered candidates.

### Changes in `src/components/admin/AnswerCoveragePanel.tsx`

1. **Redefine "unanswered in view"** — change the predicate from `c.answerCount === 0` to `c.percentage < 100` (i.e. any candidate in the filtered view that isn't fully covered).

2. **Update `visibleUnansweredCount`** (line 644) to use the new predicate so the toolbar button shows the real count and becomes enabled.

3. **Update `handleFillVisibleUnanswered`** (lines 502–517) to use the same predicate when building the batch, capped at 50 as today. Pass `regenerate=false` so only missing answers are filled — existing answers aren't overwritten.

4. **Relabel** the button from `Fill Unanswered in View (N)` to `Fill Missing in View (N)` to reflect that partial-coverage candidates are included.

No backend / edge function changes. No schema changes. No other handlers touched.