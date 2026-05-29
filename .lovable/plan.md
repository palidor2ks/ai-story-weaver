## Problem

`AUTHENTIC CAMPAIGNS, INC.` is showing up on the donor profile for Schiff for Senate as a $720K donor. It's actually a Democratic political-services **vendor** — the $720K is a refund/rebate of operating expenditures the campaign paid them, not a contribution.

Looking at the `donors` table:
- 3 rows on FEC Schedule A **Line 14** are flagged `is_contribution: true` and `is_vendor_refund: false` (total ~$731K, including the $720K Schiff row).
- Other Authentic Campaigns rows on Line 15 / 17 are already correctly flagged as vendor refunds.

FEC Schedule A Line 14 = "Refunds, Rebates, Returns of Federal Contributions" — money returned to the committee by vendors / other committees. Our ingestion logic only treats Lines 15/17/17A/17C as vendor refunds, so Line 14 leaks through as a real contribution.

## Fix

### 1. Backend ingestion (code)

`supabase/functions/fetch-committee-donors/index.ts`
- Add `'14'` to `NON_CONTRIBUTION_LINES` and `VENDOR_REFUND_LINES`.

`supabase/functions/fetch-fec-donors/index.ts` (`classifyLineNumber`)
- Add an explicit `isLine14` branch returning `{ isContribution: false, isTransfer: false, receiptType: 'other_receipt' }` so future syncs never re-create the same bad rows.

### 2. Data backfill (migration)

Update existing rows where `line_number` starts with `'14'`:

```sql
UPDATE public.donors
SET is_contribution = false,
    is_vendor_refund = true,
    amount = 0
WHERE line_number LIKE '14%'
  AND (is_contribution = true OR is_vendor_refund = false);

UPDATE public.contributions
SET is_contribution = false
WHERE line_number LIKE '14%'
  AND is_contribution = true;
```

This is the same pattern used by `cleanup-donor-aggregations` for known conduits — zero the amount and flag the row so it's preserved for audit but excluded from aggregates and the donor profile page.

### 3. Reconciliation refresh

For each affected candidate (Schiff S001150 + the handful of others), re-run finance reconciliation so `local_itemized` / `delta_*` drop the $720K. We can either:
- Extend `cleanup-donor-aggregations` to also handle Line 14, OR
- Add a one-shot SQL block in the same migration that recomputes `local_itemized`, `local_itemized_net`, `delta_amount`, `delta_pct`, and `status` for candidates touched by the update (mirroring the function's logic).

I'll go with extending the cleanup function so the same logic is reusable next time a vendor slips through.

## Out of scope

- Building a general "known vendors" list / UI — not needed to fix this bug; the line-number rule covers it.
- Changing the donor profile UI.

## Verification

After applying:
- `SELECT amount, is_contribution, is_vendor_refund FROM donors WHERE name ILIKE '%authentic campaigns%' AND candidate_id = 'S001150';` → amount 0, flags corrected.
- Donor profile for Authentic Campaigns no longer shows Schiff (or any Line 14 row) under Top Recipients / Total Given.
- Schiff finance reconciliation total drops by ~$720K.
