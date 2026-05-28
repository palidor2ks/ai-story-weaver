## Problem

On the Committee profile page, the **Cycle** dropdown changes local state but the displayed "Top Contributors" list never re-queries. The hook `useCommitteeDonors(id)` is invoked without a cycle argument, so it defaults to `'all'` and ignores the user's selection.

## Fix

In `src/pages/CommitteeProfile.tsx`:

1. Compute `effectiveCycle` (already done) *before* calling the donors hook.
2. Pass it into the hook: `useCommitteeDonors(id, effectiveCycle)`.
3. Default `selectedCycle` initial value so first render uses `availableCycles[0]` (e.g. `'2024'`) consistently — `effectiveCycle ?? '2024'` fallback to avoid an `undefined` query key flicker.

No backend or hook changes needed — `useCommitteeDonors` already accepts and filters by `cycle` (lines 560–597 of `src/hooks/useCommittees.ts`).

## Out of scope

- Cycle dropdown is currently rendered only when `isAdmin` (line 206). If non-admin users should also be able to switch cycles, that's a separate UX decision — flag and confirm before moving it out of the admin block.
