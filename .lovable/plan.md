
## Problem

JD Vance has an active `candidate_overrides` row with `overall_score = -4.82` (created Dec 2025). The Feed page uses this override (showing L4.82), but the Admin's answer coverage panel calculates the score directly from his 200 answers (showing CR2.68). This causes a mismatch.

## Fix

1. Set `is_active = false` on Vance's override (`candidate_id = 'V000137'`) so both pages fall back to the answer-calculated score (CR2.68).

This is a single data update — no code changes needed. You can also re-activate the override later using the toggle we just added to the edit dialog.
