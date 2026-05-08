The scores are missing because the admin table renders `candidate_overrides.overall_score`, but several officials have `overall_score = null` even though they already have `candidate_answers` rows. I verified examples like Craig Coughlin, Joe Vitale, Yvonne Lopez, and Colonia officials: they each have answer counts and calculable averages, but the stored score field is null.

Plan:

1. Update the admin coverage hook so scores fall back to calculated answer averages when `overall_score` is null.
   - Query `candidate_answers` for the currently loaded candidate IDs.
   - Calculate the average `answer_value` per candidate.
   - Use that calculated score only as a fallback, preserving manually stored override scores when present.

2. Apply the same fallback to civic/static officials.
   - This will make state officials and local officials show scores as soon as answers exist.
   - It will not change the database; it only fixes admin display.

3. Keep the current score format.
   - Values will continue displaying as `Lx.xx`, `CLx.xx`, `C`, `CRx.xx`, or `Rx.xx`.

Expected result:
- Officials with answers but null stored scores stop showing `—`.
- Examples from the screenshot should display calculated scores like Craig Coughlin, Joe Vitale, Yvonne Lopez, and the Colonia local officials.