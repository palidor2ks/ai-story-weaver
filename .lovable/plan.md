

# Investigation Plan: Missing Line 12 JFC Aggregate Transfers

## Problem Summary

Dan Sullivan shows **$0 local transfers** vs **$381,064 FEC transfers** (-20.1% delta). The database contains 218 Line 12 "attribution" records (individual donors) all marked with `memo_code='X'`, but the **parent aggregate transfer records** from JFCs are completely missing.

## How FEC Line 12 Transfers Work

```text
JFC receives $3,300 from Individual Donor "ROSS, JEFFREY W"
    ↓
JFC transfers aggregate to Principal Committee
    ↓
FEC Schedule A shows TWO records:

1. PARENT AGGREGATE (countable):
   ├─ contributor_name: "SULLIVAN VICTORY" 
   ├─ entity_type: COM
   ├─ line_number: 12
   ├─ memo_code: NULL ← countable!
   └─ amount: $100,000

2. ATTRIBUTION MEMO (informational):
   ├─ contributor_name: "ROSS, JEFFREY W"
   ├─ entity_type: IND
   ├─ line_number: 12
   ├─ memo_code: X ← excluded from totals
   └─ amount: $3,300
```

Currently, we import record #2 but are missing record #1.

---

## Investigation Steps

### Step 1: Verify FEC API Response

Manually query the FEC API to confirm whether parent aggregate records are returned in Schedule A:

```text
GET https://api.open.fec.gov/v1/schedules/schedule_a/
    ?committee_id=C00570994
    &two_year_transaction_period=2024
    &line_number=12
    &per_page=100
    &api_key=[FEC_API_KEY]
```

**Expected:** Should see both `entity_type='COM'` (parent aggregates) and `entity_type='IND'` (attributions) records.

**If parent records are present:** The import logic is filtering them out.
**If parent records are absent:** FEC may require a different endpoint or parameters.

### Step 2: Check Import Logic Filtering

Review `fetch-fec-donors/index.ts` around lines 1130-1260 for any filtering that could exclude committee-to-committee transfers:

| Check Point | File:Line | What to Verify |
|-------------|-----------|----------------|
| Classification | L136-140 | Does `classifyLineNumber` return `isContribution=true` for Line 12 COM records? |
| Entity mapping | L111-125 | Does `mapEntityType('COM')` return 'PAC' correctly? |
| Skip logic | L1137-1140 | Is `includeOtherReceipts` accidentally filtering transfers? |
| Contribution batch | L1233-1258 | Are COM records being added to `contributionBatch`? |

### Step 3: Database Audit

Query to identify if any Line 12 PAC/Organization records exist without memo_code='X':

```sql
SELECT 
  contributor_type,
  COUNT(*) as count,
  SUM(amount) as total,
  memo_code
FROM contributions
WHERE recipient_committee_id = 'C00570994'
  AND cycle = '2024'
  AND line_number LIKE '12%'
  AND contributor_type != 'Individual'
  AND (memo_code IS NULL OR memo_code != 'X')
GROUP BY contributor_type, memo_code;
```

**Expected:** Should return the missing JFC aggregate transfers.
**Current:** Returns empty (0 records).

### Step 4: Compare with Other Candidates

Check if this is a Sullivan-specific issue or a systemic problem:

```sql
SELECT 
  c.name as candidate_name,
  fr.local_transfers,
  fr.fec_transfers,
  fr.fec_transfers - fr.local_transfers as transfer_gap,
  CASE 
    WHEN fr.fec_transfers > 0 
    THEN ROUND(((fr.fec_transfers - fr.local_transfers) / fr.fec_transfers * 100), 2)
    ELSE 0 
  END as gap_pct
FROM finance_reconciliation fr
JOIN candidates c ON c.id = fr.candidate_id
WHERE fr.cycle = '2024'
  AND fr.fec_transfers > 10000
  AND fr.local_transfers < fr.fec_transfers * 0.5
ORDER BY transfer_gap DESC
LIMIT 20;
```

---

## Potential Fixes (After Investigation)

### If FEC API Returns Parent Records (Import Bug)

1. **Fix import filtering**: Ensure `entity_type='COM'` records on Line 12 are not inadvertently filtered
2. **Re-sync affected committees**: Run fresh syncs for candidates with transfer gaps
3. **Add logging**: Log Line 12 record types during import for debugging

### If FEC API Doesn't Return Parent Records in Schedule A

1. **Alternative endpoint**: Check if transfers are in a different FEC endpoint (e.g., Schedule H4 for JFC allocations)
2. **Derived calculation**: Calculate transfers as: `FEC_transfers` value from committee totals endpoint
3. **Use FEC summary as source**: Store `fec_transfers` directly without local itemization

---

## Files to Investigate

| File | Purpose |
|------|---------|
| `supabase/functions/fetch-fec-donors/index.ts` | Main import logic - check for filtering |
| `supabase/functions/import-fec-receipts-csv/index.ts` | CSV import - verify Line 12 handling |
| `supabase/migrations/20260120154618*.sql` | RPC functions - verify transfer_total calculation |

---

## Expected Outcome

After investigation, we'll know:
1. Whether parent aggregate transfers ARE returned by FEC API (import bug) or NOT (API limitation)
2. The scope of the issue (Sullivan-only vs. systemic)
3. The correct fix approach (import logic vs. derived calculation)

