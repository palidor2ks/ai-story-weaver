
# Fix Finance Reconciliation - Transfer Gap Issue

## Problem Analysis

Dan Sullivan shows **$0 Local / $381,064 FEC** for Transfers (Line 12), causing a **-20.1% delta** in the Admin dashboard.

### Root Cause (Data Investigation)

| Metric | Sullivan | Begich (Working) |
|--------|----------|------------------|
| Line 12 records with `memo_code=NULL` | **0** | 10 |
| Line 12 records with `memo_code='X'` | 227 ($801K) | 97 ($193K) |
| FEC Transfer Total | $381,064 | $176,572 |
| Local Transfer Total (RPC) | $0 | $176,572 ✓ |

**Key Insight:** Sullivan's import only contains JFC attribution memos (`memo_code='X'`) — the **parent aggregate transfer records** that should have `memo_code=NULL` are missing. Begich's import has both, so his totals match.

**Why we can't sum `memo_code='X'` records:** They total $801K, which is **2x the FEC total** ($381K). JFC attribution memos represent individual donors across multiple committees, causing overlap.

---

## Solution: Math.max Fallback for Line 12/13/14/15

Use `Math.max(local, fec)` for Transfers, Loans, and Other Receipts when calculating the "Local Total" for display. This ensures the most complete data is used when local imports are incomplete.

### Files to Modify

**1. Frontend - UI Calculation**
`src/components/admin/AnswerCoveragePanel.tsx` (around line 2022)

```typescript
// BEFORE:
const localTotal = localItemized + localTransfers + localLoans + localOtherReceipts 
                 + fecUnitemized + fecCandidateContribution;

// AFTER:
// Use Math.max for Transfers/Loans/Other to fill gaps when local data is incomplete
const effectiveTransfers = Math.max(localTransfers, fecTransfers);
const effectiveLoans = Math.max(localLoans, fecLoans);
const effectiveOther = Math.max(localOtherReceipts, fecOtherTotal);

const localTotal = localItemized + effectiveTransfers + effectiveLoans + effectiveOther 
                 + fecUnitemized + fecCandidateContribution;
```

**2. Edge Function - Stored Delta Calculation**
`supabase/functions/refresh-fec-totals/index.ts` (around line 371)

Apply the same `Math.max` pattern so the database-stored `total_receipts_delta` matches the UI calculation.

**3. Nightly Reconciliation (Consistency)**
`supabase/functions/nightly-finance-reconciliation/index.ts`

Apply the same `Math.max` pattern for batch reconciliation.

---

## Expected Result for Dan Sullivan

| Line Item | Before Fix | After Fix |
|-----------|------------|-----------|
| Effective Transfers | $0 | $381,064 (from FEC) |
| Effective Loans | $0 | $0 |
| Effective Other | $73,615 | $73,615 |
| Local Total | ~$1.5M | ~$1.9M |
| Delta | **-20.1%** | **~0%** |

---

## Technical Notes

### Why Math.max Works

According to the project memory notes (`finance/reconciliation-calculation-logic`), the `localTotal` should use `Math.max(local, fec)` for Lines 12, 13, 14, 15 to ensure the most complete data is used. Only **Unitemized** and **Candidate Self-Fund** remain as FEC-only line items.

### Category Popover Transparency

The "Category Comparison" popover will continue showing **$0 Local / $381,064 FEC** for Transfers to maintain transparency about what data was actually imported. Only the **total calculation** changes.

### Future: Root Cause Fix

The underlying issue is that parent aggregate Line 12 records are missing from Sullivan's import. A follow-up task could investigate why the FEC API or CSV export doesn't include these records.
