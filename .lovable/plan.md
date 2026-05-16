## Goal
Make the Cycle dropdown in the Committee Management popover always reflect cycles that actually exist for the candidate's committees, so 2026 (and any future cycle) appears automatically without code changes.

## Changes

**File:** `src/components/admin/CommitteeBreakdown.tsx`

1. Compute a memoized `availableCycles` list from `committees[].cycles`:
   - Flatten all `cycles` arrays across the candidate's committees
   - Add a baseline of the current federal cycle and previous one (so the list is never empty before sync)
   - Dedupe and sort descending (newest first)
   - Always append an `"all"` option at the end

2. Replace the hardcoded `<SelectItem>` list (lines 341–345) with `availableCycles.map(...)`.

3. Change the default `selectedCycle` (line 48) from the hardcoded `'2024'` to the newest cycle in `availableCycles` (set via a `useEffect` once committees load, only if the current value isn't in the list).

4. If the current `selectedCycle` is no longer valid after committees load (e.g. candidate has no 2024 data), fall back to the newest available cycle.

## Why this fixes the bug
The dropdown was hardcoded to 2024/2022/2020/2018/All. ZDAN, ALEX's committee has a 2026 cycle in `candidate_committees.cycles`, but the UI never read that column, so 2026 was invisible. Deriving from the actual data fixes this candidate and every future cycle automatically.

## Out of scope
- No DB changes
- No edge function changes
- No changes to `useAvailableCycles` (a separate hook used elsewhere) — this popover already has the committee data loaded locally, so a local memo is simpler and avoids an extra query.
