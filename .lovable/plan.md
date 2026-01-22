

# Fix: Line 12 Attribution Records Missing memo_code = 'X'

## Problem Identified

Vern Buchanan shows **$160K local** vs **$62K FEC** for Line 12 Transfers.

**Root Cause:** The FEC import process is importing Line 12 attribution records (individual names showing WHO contributed through a JFC) without setting `memo_code = 'X'`. The FEC only counts aggregate JFC transfers in Line 12 totals, but we're counting both:

| Record Type | Amount | Should Count? |
|-------------|--------|---------------|
| JFC Aggregate Transfer (VICTORY 2024) | $62,324 | Yes |
| PAC Transfer (SELECT MEDICAL PAC) | $10,000 | Yes (if real transfer) |
| Individual Attribution Records | $87,700 | No - should have memo_code='X' |

The attribution records have `memo_text` like "VICTORY 2024 TRANSFER" showing they're informational records, but `memo_code` is NULL instead of 'X'.

---

## Solution Options

### Option A: Fix at Import Time (Preferred)
Update the import edge function(s) to detect attribution records and set `memo_code = 'X'`:

```typescript
// In import function - detect attribution records on Line 12
if (lineNumber === '12' && contributorType === 'Individual') {
  // Individual names on Line 12 are attribution records, not actual transfers
  // Mark them so they're excluded from reconciliation totals
  memoCode = 'X';
}
```

### Option B: Fix RPC to Exclude Non-Committee Line 12 Records
Update the `transfer_total` calculation to only count committee-to-committee transfers:

```sql
-- Only count Line 12 where contributor is a committee (not individuals)
COALESCE(SUM(CASE 
  WHEN c.line_number = '12' 
    AND COALESCE(c.memo_code, '') != 'X' 
    AND c.contributor_type NOT IN ('Individual')  -- NEW: exclude individuals
  THEN c.amount ELSE 0 END), 0)::numeric AS transfer_total,
```

### Option C: One-Time Data Fix + Import Fix
1. Update existing Line 12 individual records to set `memo_code = 'X'`
2. Fix import to prevent future occurrences

---

## Recommended Approach: Option C (One-Time Fix + Import Fix)

### Step 1: One-Time Data Migration
Update existing Line 12 individual attribution records:

```sql
UPDATE contributions
SET memo_code = 'X'
WHERE line_number = '12'
  AND contributor_type = 'Individual'
  AND memo_code IS NULL
  AND cycle = '2024';
```

### Step 2: Update Import Edge Function
Add logic to detect and mark attribution records during import.

### Step 3: Re-run FEC Totals Refresh
Refresh Buchanan's totals to verify fix.

---

## Expected Result

After fix:
- **Local Line 12**: ~$72K (JFC + PAC transfers only)
- **FEC Line 12**: $62K
- **Delta**: ~+$10K (the PAC transfers may be separately reported)

---

## Files to Modify

| File | Changes |
|------|---------|
| Database migration | Update Line 12 individual records to set memo_code='X' |
| `supabase/functions/fetch-fec-donors/index.ts` or `import-fec-receipts-csv/index.ts` | Detect attribution records during import |

