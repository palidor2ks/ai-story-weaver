# Fix Delta column to account for FEC unitemized receipts

## Why

The Delta column on the admin Answer Coverage grid currently looks wrong because the value persisted in `finance_reconciliation.total_receipts_delta_amount` (which the UI prefers) is often missing or stale — it is only written by `refresh-fec-totals`. `fetch-fec-donors` (the function that runs on every donor sync) and `nightly-finance-reconciliation` both upsert reconciliation rows *without* `total_receipts_delta_amount`, so after any sync the Delta badge falls back to whatever older value was stored — which does not subtract unitemized + candidate self-fund + FEC-only top-ups. Result: balanced candidates still show large deltas.

The frontend already has the correct formula inline (`AnswerCoveragePanel.tsx` L2282-2299): `localTotal = localItemized + max(transfers) + max(loans) + max(other) + fecUnitemized + fecCandidateSelfFund`, then `delta = localTotal − fecTotalReceipts`. The fix is to (a) prefer this inline value over the stale DB value in the UI, and (b) keep the DB column in sync from the two writers that currently skip it.

## Changes

### 1. `src/components/admin/AnswerCoveragePanel.tsx` — prefer recomputed delta
- L2616-2617: swap the fallback order so the freshly computed `calculatedDelta` / `calculatedDeltaPct` is used as the primary value, and `candidate.totalReceiptsDeltaAmount` / `totalReceiptsDeltaPct` is only the fallback when FEC totals are missing.

```tsx
deltaAmount={calculatedDelta ?? candidate.totalReceiptsDeltaAmount}
deltaPct={calculatedDeltaPct ?? candidate.totalReceiptsDeltaPct}
```

This guarantees the Delta column always reflects the same math the breakdown popover already shows the user, regardless of which edge function last wrote the row.

### 2. `supabase/functions/fetch-fec-donors/index.ts` — write `total_receipts_delta_amount` on sync
Around L1620-1669, after the existing per-category deltas, compute the same total-receipts delta `refresh-fec-totals` already uses and include it in the upsert:

```ts
const effectiveTransfers = Math.max(totalLocalTransfers, totalFecTransfers ?? 0);
const effectiveLoans     = Math.max(totalLocalLoans ?? 0, totalFecLoans ?? 0);
const effectiveOther     = Math.max(totalLocalOther ?? 0, (totalFecOtherReceipts ?? 0) + (totalFecOffsetsToOperatingExpenditures ?? 0));
const localTotalReceipts = totalLocalItemized + effectiveTransfers + effectiveLoans + effectiveOther
                         + (totalFecUnitemized ?? 0) + (totalFecCandidateContribution ?? 0);
const totalReceiptsDeltaAmount = totalFecReceipts > 0 ? Math.round(localTotalReceipts - totalFecReceipts) : null;
const totalReceiptsDeltaPct    = totalFecReceipts > 0 ? ((localTotalReceipts - totalFecReceipts) / totalFecReceipts) * 100 : null;
```

Add `total_receipts_delta_amount` and `total_receipts_delta_pct` to the upsert payload. Pull the missing locals/FECs (`totalLocalLoans`, `totalLocalOther`, `totalFecTransfers`, `totalFecLoans`, `totalFecOtherReceipts`, `totalFecOffsetsToOperatingExpenditures`, `totalFecCandidateContribution`) from the same rollup aggregation loop that already produces `totalFecUnitemized` / `totalFecReceipts`; default any missing source to 0 so the formula degrades gracefully when the function is invoked before `refresh-fec-totals` has populated full FEC breakdowns.

### 3. `supabase/functions/nightly-finance-reconciliation/index.ts` — same write
Around L411-430, mirror the same `localTotalReceipts` calc and add `total_receipts_delta_amount` / `total_receipts_delta_pct` to the upsert. All required inputs (`localItemized`, `localTransfers`, `localLoans`, `localOther`, `totalFecTransfers`, `totalFecLoans`, `totalFecOtherReceipts`, `totalFecOffsetsToOperatingExpenditures`, `totalFecUnitemized`, `totalFecCandidateContribution`, `totalFecReceipts`) are already in scope at L411 — the function just has not been writing the field.

## Out of scope

- No DB migration. `total_receipts_delta_amount` / `total_receipts_delta_pct` columns already exist.
- No changes to `delta_amount` / `delta_pct` (itemized-only) or `individual_delta_amount` / `pac_delta_amount` — those remain apples-to-apples integrity checks.
- No change to sync logic, cursor handling, or what Schedule A returns. Unitemized donors will still not appear as individual rows (FEC does not expose them).

## Verification

1. Reload `/admin` Answer Coverage grid for cycle 2026.
2. Candidates whose breakdown popover shows Local ≈ FEC (e.g. Gallego, Grijalva) should now show Delta ≈ $0 / 0%.
3. Candidates with large unitemized flow (Schweikert, Crane, Gosar, Kelly, Hamadeh) should show a much smaller Delta — what remains is the actual missing-itemized-equivalent gap, not the unitemized floor.
4. Run a single-candidate FEC donor sync and confirm the freshly upserted `finance_reconciliation` row now has `total_receipts_delta_amount` populated (not null) and matches the UI's calculated value.