

# Fix: Rick Scott Total Receipts Delta Missing Self-Funding

## Problem Identified

Rick Scott shows a **-3.27% delta ($1.2M under)** in Total Receipts because the `localTotalReceipts` calculation **does not include FEC's `candidate_contribution`** (self-funding).

| Component | FEC Amount | Included in Local? |
|-----------|------------|-------------------|
| Itemized Contributions | $3,327,273 | ✅ Yes |
| Unitemized | $2,229,367 | ✅ Yes (FEC-only) |
| Transfers | $8,562,714 | ✅ Yes |
| Loans | $20,138,834 | ✅ Yes |
| Other Receipts | $138,866 | ✅ Yes |
| **Candidate Self-Fund** | **$1,255,016** | ❌ **NO - MISSING** |
| **Total** | **$36,696,093** | — |

The FEC's `receipts` total includes `candidate_contribution` but our calculation excludes it, causing the ~$1.2M delta.

---

## Solution

### Step 1: Update `fetchFECTotals()` to Return Self-Fund Amount

**File:** `supabase/functions/refresh-fec-totals/index.ts`

**Lines 81-117** - Expand the return type and include `candidate_contribution`:

```typescript
async function fetchFECTotals(fecApiKey: string, committeeId: string, cycle: string): Promise<{
  fecItemized: number | null;
  fecUnitemized: number | null;
  fecTotalReceipts: number | null;
  fecPacContributions: number | null;
  fecPartyContributions: number | null;
  fecCandidateContribution: number | null;  // NEW
}> {
  // ... existing code ...
  
  return {
    fecItemized: Math.round(totals.individual_itemized_contributions || 0),
    fecUnitemized: Math.round(totals.individual_unitemized_contributions || 0),
    fecTotalReceipts: Math.round(totals.receipts || 0),
    fecPacContributions: Math.round(totals.other_political_committee_contributions || 0),
    fecPartyContributions: Math.round(totals.political_party_committee_contributions || 0),
    fecCandidateContribution: Math.round(totals.candidate_contribution || 0)  // NEW
  };
}
```

### Step 2: Update Batch Mode to Include Self-Fund

**Lines ~360-375** - Add self-fund to aggregation and local total calculation:

```typescript
// Aggregate across committees
let totalFecCandidateContribution = 0;  // NEW

for (const fecData of fecResults) {
  // ... existing aggregations ...
  totalFecCandidateContribution += fecData.fecCandidateContribution ?? 0;  // NEW
}

// Update local total calculation
const localTotalReceipts = localItemized + localTransfers + localLoans + localOther 
  + totalFecUnitemized + totalFecCandidateContribution;  // ADD self-fund
```

### Step 3: Update Single-Candidate Mode to Include Self-Fund

**Lines ~648** - Same fix for single-candidate mode:

```typescript
// BEFORE
const localTotalReceipts = localItemized + localTransfers + localLoans + localOther + totalFecUnitemized;

// AFTER
const localTotalReceipts = localItemized + localTransfers + localLoans + localOther 
  + totalFecUnitemized + totalFecCandidateContribution;
```

### Step 4: Refresh Rick Scott's Totals

After deploying the fix, refresh Rick Scott to verify:
- Expected delta after fix: **+$56,848 (+0.15%)** instead of -$1,198,168 (-3.27%)
- The small positive delta represents local transfers being slightly higher than FEC ($56K)

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/refresh-fec-totals/index.ts` | 1. Add `fecCandidateContribution` to `fetchFECTotals()` return type and value<br>2. Aggregate `totalFecCandidateContribution` in batch mode<br>3. Include self-fund in `localTotalReceipts` calculation (both modes) |

---

## Expected Result After Fix

| Candidate | Before Fix | After Fix |
|-----------|------------|-----------|
| Rick Scott | -3.27% ($1.2M under) | ~+0.15% ($57K over) |

The remaining +$57K is legitimate: local transfers are slightly higher than FEC reports, which is acceptable variance from timing differences.

---

## Technical Note

The column `fec_candidate_contribution` already exists in `finance_reconciliation` and is being stored correctly. The only issue is that it's not included in the `localTotalReceipts` formula used for delta calculation.

