## Goal
Apply the remaining piece of the linked Codex change to `/donors`. The debounced search and 24-row page size are already in place; the missing optimization is auto-defaulting the cycle filter to the most recent available cycle so the first query doesn't hit the expensive "All Cycles" path.

## Change
Edit `src/pages/Donors.tsx`:

1. Compute `preferredCycle` from `filterOptions.cycles` — pick the numeric max if cycles parse as numbers, otherwise the first entry; fall back to `'all'` when none.
2. Add a one-shot `useEffect` that, once `preferredCycle` is known, sets `filters.cycle` to it only if the user hasn't already chosen a non-`'all'` cycle. This keeps the filter UI and the query in sync (no silent override).
3. Leave the existing debounce, memoized `effectiveFilters`, page size, and rest of the component unchanged.

## Out of scope
- No hook / RPC / edge-function changes.
- No UI/visual changes to filters or cards.

## Acceptance
- First load of `/donors` issues the donors query against the latest cycle (e.g. `2026`) instead of `all`, and the cycle dropdown reflects that selection.
- Switching the cycle filter manually (including back to "All Cycles") continues to work and is not overridden on subsequent renders.
