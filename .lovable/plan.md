## Why these are showing up

AIR PARTNER LLC and HARRIS SIKES MEDIA LLC are not donors — they are vendors (charter jet + media buyer) that issued refunds/rebates to Trump-aligned committees. The FEC reports those refunds on Schedule A under specific line numbers:

- **Line 15** — "Offsets to Operating Expenditures" (Form 3X). Vendor refunds, rebates, returned bank charges. ~$6.3M of Organization-typed "donors" come in on this line.
- **Line 17** — "Other Federal Receipts" (Form 3X). Dividends, interest, miscellaneous rebates. ~$3.4M of Organization-typed entries and another ~$46M of Individual-typed entries are flagged here.

In `supabase/functions/fetch-fec-donors/index.ts` (`classifyLineNumber`), both Line 15 and Line 17 are currently returned with `isContribution: true`. So the importer writes them into `donors` and they appear in donor lists/totals as if they were contributions.

A few other lines (18 transfers in, 20A refunds-of-contributions, 21 other disbursements) are also leaking into the donor table and should not be there either.

## Fix

### 1. Reclassify non-contribution receipt lines

In `supabase/functions/fetch-fec-donors/index.ts`:

- Line 15 → `isContribution: false`, `receiptType: 'other_receipt'`, set `is_vendor_refund: true`.
- Line 17 → `isContribution: false`, `receiptType: 'other_receipt'`. Keep `is_vendor_refund: true` when the entity is an Organization (vendor rebate); for Individuals on Line 17 (rare; usually misc rebates/escheat), still mark `isContribution: false` so they don't inflate donor totals.
- Lines 18, 20A, 21 → `isContribution: false` (these are transfers or outflows, not donor contributions). Skip insert entirely rather than store as `donor` rows.

Apply the same classification in `supabase/functions/fetch-committee-donors/index.ts` (it has its own insert path with `line_number`).

### 2. Exclude non-contributions from the donor list UI / RPCs

The donor list is served by `get_donors_paginated`, `search_donors_by_name`, and `search_raw_donors_by_name` (see `src/hooks/useDonorsPaginated.ts`) plus the candidate profile donors query. All of them should filter out rows where `is_contribution = false` OR `is_vendor_refund = true` OR `line_number IN ('15','17','17A','17C','18','20A','21')`.

- Add a migration that updates each RPC to add a `WHERE is_contribution AND NOT COALESCE(is_vendor_refund,false) AND COALESCE(line_number,'') NOT IN ('15','17','17A','17C','18','20A','21')` clause.
- Keep the rows in the table (useful for reconciliation against FEC totals) but hide them from donor browsing.

### 3. Backfill existing data

One-off SQL migration to update already-imported rows so the UI fix takes effect without a re-sync:

```sql
UPDATE public.donors
SET is_contribution = false,
    is_vendor_refund = true
WHERE line_number IN ('15','17','17A','17C');

UPDATE public.donors
SET is_contribution = false
WHERE line_number IN ('18','20A','21');
```

### 4. Reconciliation card

`FinanceReconciliationCard` already shows Line 14/15 offsets. Verify it still reads from `donors` correctly after the flag flip (it uses `is_vendor_refund`/`line_number` filters, not `is_contribution`), so the offset totals on the candidate finance page continue to match FEC.

## Result

AIR PARTNER LLC, HARRIS SIKES MEDIA LLC, and similar vendor refund/rebate entries will no longer appear in the donor list for Trump or any other candidate. They remain in the database for reconciliation but are correctly classified as offsets, not contributions.
