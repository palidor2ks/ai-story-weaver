
# Fix: Inconsistent Delta Calculation in Single-Candidate Refresh

## Problem Summary

The Admin dashboard shows conflicting data for Dan Sullivan:
- **Transfer Details**: $0 Local / $381K FEC (correct - shows raw imported data)
- **Local Column**: $1.9M (correct - uses `Math.max` fallback in frontend)
- **FEC Column**: $1.9M (correct)
- **Delta Column**: -$381K (-20.1%) (wrong - using stale database value)

## Root Cause

The `refresh-fec-totals` edge function has **two code paths** that calculate `total_receipts_delta`:

| Code Path | Line Range | Math.max Applied? | Status |
|-----------|------------|-------------------|--------|
| Batch mode | 397-400 | ✅ Yes | Working correctly |
| Single-candidate mode | 691 | ❌ No | **Bug here** |

When Dan Sullivan was refreshed via single-candidate mode, the database stored the **incorrect delta** (-$381K) because `Math.max(local, fec)` wasn't applied for transfers/loans/other.

## Solution

Update the **single-candidate mode** in `supabase/functions/refresh-fec-totals/index.ts` to use the same `Math.max` fallback logic as batch mode.

---

## Technical Changes

### File: `supabase/functions/refresh-fec-totals/index.ts`

**Before (line 691):**
```typescript
const localTotalReceipts = localItemized + localTransfers + localLoans + localOther + totalFecUnitemized + totalFecCandidateContribution;
```

**After:**
```typescript
// Use Math.max for Transfers/Loans/Other to fill gaps when local data is incomplete
// This handles cases where parent aggregate records are missing from local imports
const effectiveTransfers = Math.max(localTransfers, totalFecTransfers);
const effectiveLoans = Math.max(localLoans, totalFecLoans);
const effectiveOther = Math.max(localOther, totalFecOtherReceipts + totalFecOffsetsToOperatingExpenditures);
const localTotalReceipts = localItemized + effectiveTransfers + effectiveLoans + effectiveOther + totalFecUnitemized + totalFecCandidateContribution;
```

---

## Verification Steps

After deploying the fix:

1. **Re-sync Dan Sullivan** by clicking the refresh button in the Admin dashboard
2. **Verify database update**: `total_receipts_delta_amount` should change from -$381K to ~$0
3. **Verify UI consistency**: Delta column should now show ~$0 matching the Local/FEC columns

---

## Expected Result for Dan Sullivan

| Metric | Before Fix | After Fix |
|--------|------------|-----------|
| effectiveTransfers | $0 | $381,064 (Math.max) |
| localTotalReceipts | ~$1.5M | ~$1.9M |
| total_receipts_delta_amount | -$381,070 | ~$0 |
| total_receipts_delta_pct | -20.1% | ~0% |
