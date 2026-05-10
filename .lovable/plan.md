## Problem

On `/candidate/:id`, switching the cycle dropdown does change the donors list, but the **FEC Total Receipts** card and the **FEC Contribution Breakdown** don't reliably change. Two bugs:

1. `useFinanceReconciliation`, `useFECTotals`, and `useCommitteeRollups` are called with `effectiveCycle && effectiveCycle !== 'all' ? effectiveCycle : undefined`. When the user picks **"All cycles"**, that resolves to `undefined`, and each hook then silently falls back to its hard-coded `'2024'` default. So "All cycles" actually shows 2024 numbers — confusing and wrong.
2. On first paint, `effectiveCycle` is `undefined` until `useAvailableCycles` resolves, so the very first reconciliation/totals fetch goes out for `2024` even when the default cycle will end up being `2026`. The donors list later refetches for `2026`, but a stale 2024 reconciliation row can stick in the UI until the second fetch lands (and on candidates with no 2024 row, the breakdown disappears entirely).

## Fix

Frontend-only. No DB or edge-function changes.

### `src/pages/CandidateProfile.tsx`

- Don't fire the finance hooks until `cycleInfo` is loaded — gate them on `effectiveCycle` being defined.
- For the **"All cycles"** case, fetch the reconciliation/rollup rows for *every* cycle in `cycleInfo.cycles` and sum the FEC fields client-side (fec_total_receipts, fec_itemized, fec_unitemized, fec_pac_contributions, fec_party_contributions, fec_loans, fec_transfers, fec_candidate_contribution, fec_other_receipts, local_*). For the single-cycle case, behavior stays the same.
- Remove the silent `'2024'` fallback when calling `useFECTotals` — pass the actual selected cycle, and skip the live FEC fallback when "All cycles" is selected (it can't be aggregated cleanly via the FEC API in one call).
- `handleFetchDonors` keeps its existing `effectiveCycle ?? defaultCycle` behavior (sync needs a concrete cycle).

### `src/hooks/useFinanceReconciliation.ts`

- Add an overload (or sibling hook) `useFinanceReconciliationAll(candidateId, cycles[])` that fetches all rows for the candidate where `cycle = ANY(cycles)` and returns them as an array. The page component does the summing so the existing single-row hook signature stays untouched for other callers.
- Same pattern for `useCommitteeRollups`.

### `src/hooks/useFECTotals.ts`

- Accept `enabled` flag so the page can disable it when `effectiveCycle === 'all'` (no aggregation across cycles via the FEC API).

### Acceptance

- Picking **2024** on John Hsu shows FEC Total Receipts = $6,183 and Itemized = $2,550.
- Picking **2026** shows $96,855 / $54,448.
- Picking **All cycles** shows the *sum* of every reconciliation row (≈ $103,038 here), not the 2024 fallback.
- No flash of 2024 data on initial page load when the default cycle is 2026.

