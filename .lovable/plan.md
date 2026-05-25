## Problem

On Andy Barr's profile the header reads **FEC Total Receipts $8.3M** but the **Funding Sources** panel shows **$4.8M** with Individual Donors at 100%. The two figures should reconcile.

Root cause: `fundingInput` (in `CandidateProfile.tsx`) reads PAC, party, transfers, loans, candidate, and other-receipts buckets from `financeReconciliation` only and falls back to `0`. For Barr those reconciliation fields are empty, so the breakdown collapses to itemized + unitemized individuals ($4.8M). The live FEC API (`useFECTotals`) does expose `total_receipts` and `other_receipts`, but those are never fed into the breakdown, so the panel total silently disagrees with the headline FEC total.

## Fix

Edit only `src/components/FundingSourcesBreakdown.tsx` and the `fundingInput` assembly in `src/pages/CandidateProfile.tsx`. No backend / schema changes.

1. **Pass FEC total into the breakdown.** Add an optional `fecTotalReceipts` field to `FundingInput` (`src/lib/fundingBreakdown.ts`) and forward `fecTotalReceipts` from `CandidateProfile.tsx` into `fundingInput`.

2. **Fall back to live FEC API for missing buckets.** In `CandidateProfile.tsx`, when `financeReconciliation` is null for a bucket, use the live `fecTotals` equivalents where available:
   - `fecOtherReceipts` ← `fecTotals.other_receipts`
   - itemized/unitemized already fall back; keep that.

3. **Add a reconciling "Other / Uncategorized" bucket.** In `computeFundingBreakdown`:
   - Compute `known = individuals + pacs + other + self`.
   - If `fecTotalReceipts > known + $1`, append a 5th bucket `Other / Uncategorized` = `fecTotalReceipts − known` (muted gray, lower opacity) so the bars always sum to the headline FEC total.
   - If `known > fecTotalReceipts` (shouldn't happen, but guard), keep current behavior.
   - When `fecTotalReceipts` is provided, use it as the panel `total` so percentages and the header `$X.XM` match the candidate header.

4. **Header label.** Keep `Funding Sources · {cycle} Cycle`, but the right-hand total now equals FEC Total Receipts. No new copy.

## Result

For Barr the panel will show Individual Donors at ~58 % ($4.8M / $8.3M) plus an "Other / Uncategorized" bucket for the ~$3.5M that isn't broken out, and the panel total will read $8.3M, matching the headline.

## Files

- `src/lib/fundingBreakdown.ts` — add `fecTotalReceipts` to `FundingInput`; add uncategorized bucket; use FEC total as denominator when present.
- `src/pages/CandidateProfile.tsx` — pass `fecTotalReceipts` and fall back to `fecTotals.other_receipts` when assembling `fundingInput`.