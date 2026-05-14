## Goal
Revert the auto-cycle default on `/donors` so the page loads with "All Cycles" selected instead of jumping to 2026.

## Change
In `src/pages/Donors.tsx`, remove the `preferredCycle` `useMemo` and the `useEffect` that overrides `filters.cycle` once filter options load. Keep the debounced search, page size, and memoized `effectiveFilters` intact. Initial state already has `cycle: 'all'`, so removing those two blocks restores the default.

## Out of scope
- No hook / RPC changes.
- No filter UI changes — users can still pick 2026 (or any cycle) manually.

## Acceptance
- First load of `/donors` shows "All Cycles" in the cycle dropdown and queries with `cycle: 'all'`.
