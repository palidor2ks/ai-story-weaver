

# Fix: WINRED/ActBlue Conduit Aggregate Records Inflating Local Itemized Totals

## Problem Identified

Daniel Webster shows **$1.08M local itemized** vs **$490K FEC itemized** - a **$216K delta (25% error)**.

**Root Cause:** WINRED conduit aggregate records on Line 11AI are being counted in the local itemized total, but the FEC excludes these from their individual itemized contributions.

| Record Type | Amount | FEC Counts? | We Count? |
|-------------|--------|-------------|-----------|
| Individual contributions (Line 11AI) | $490,421 | ✅ Yes | ✅ Yes |
| WINRED aggregate conduit records (Line 11AI, Org) | $211,124 | ❌ No | ❌ Should exclude |
| PAC contributions (Line 11AI + 11C) | $415,350 | Separate category | ✅ Yes |

The WINRED records all have memo_text: `"TOTAL EARMARKED THROUGH CONDUIT. PAC LIMIT NOT AFFECTED."` - these are informational records showing aggregate pass-throughs, not actual contributions to be counted in itemized totals.

---

## Why Current Exclusion Logic Doesn't Work

The RPC has a `conduit_excluded` field that checks:
```sql
WHERE c.conduit_committee_id IS NOT NULL
```

But these WINRED records don't have `conduit_committee_id` set - they have `NULL`. The `conduit_organizations` table exists with WINRED entries, but the RPC **doesn't actually use this table** for exclusion.

---

## Solution: Mark Conduit Aggregate Records with memo_code='X'

Similar to the Line 12 attribution fix, these conduit aggregate records should have `memo_code = 'X'` to be excluded from reconciliation totals.

### Step 1: One-Time Data Migration

```sql
-- Fix conduit aggregate records: Organization/PAC records on Line 11AI with conduit 
-- pass-through memo_text are aggregate records, not countable contributions.
-- Mark them with memo_code='X' to exclude from reconciliation totals.

UPDATE contributions
SET memo_code = 'X'
WHERE line_number = '11AI'
  AND contributor_type IN ('Organization', 'Unknown')
  AND memo_text ILIKE '%EARMARKED THROUGH CONDUIT%'
  AND (memo_code IS NULL OR memo_code = '');
```

### Step 2: Update Import Edge Functions

Add detection logic to automatically flag these records during import:

```typescript
// In fetch-fec-donors and import-fec-receipts-csv

// CRITICAL: Conduit aggregate records (WINRED/ActBlue pass-through totals) 
// should be excluded from itemized totals
const isConduitAggregate = 
  lineNumber === '11AI' && 
  contributorType !== 'Individual' &&
  memoText?.toUpperCase()?.includes('EARMARKED THROUGH CONDUIT');

const effectiveMemoCode = isLine12Attribution || isConduitAggregate 
  ? 'X' 
  : (memoCode || null);
```

### Step 3: Refresh FEC Totals

Refresh Webster's totals to verify the fix.

---

## Expected Result

After fix:
- **Local Itemized**: ~$870K (excluding $211K WINRED conduit aggregates)
- **FEC Itemized**: $490K (individual) + PAC/Party in separate categories
- **Delta**: Should align closely with category breakdowns

The `organization_total` in the RPC will drop from $211K to ~$0, as these were all conduit records.

---

## Files to Modify

| File | Changes |
|------|---------|
| Database migration | Mark existing conduit aggregate records with memo_code='X' |
| `supabase/functions/fetch-fec-donors/index.ts` | Add conduit aggregate detection during import |
| `supabase/functions/import-fec-receipts-csv/index.ts` | Add conduit aggregate detection during import |

---

## Verification SQL

After applying fix:
```sql
SELECT * FROM get_contribution_totals('W000806', '2024');
-- organization_total should be $0 or very low
-- memo_x_total should increase by ~$211K
```

