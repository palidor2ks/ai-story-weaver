## Fix: distinguish new vs updated rows, preserve original session

### Problem
- `inserted` count in the UI lies — it counts inserts + updates because the upsert returns affected rows.
- Re-importing the same CSV overwrites `import_session_id` on existing rows, so undoing the new session would delete rows brought in by an older session, and the old session's `inserted_rows` counter becomes inaccurate.

### Changes

**1. Edge function `import-fec-schedule-e-csv/index.ts`**

Replace the single blind upsert with a 3-step flow per chunk:

```text
a. SELECT existing keys in this chunk
   → admin.from('independent_expenditures')
       .select('fec_transaction_id, spending_committee_fec_id')
       .in('fec_transaction_id', chunkTxIds)
b. Partition chunk into newRows vs updateRows by (tx_id, committee_id)
c. INSERT newRows (plain insert, no upsert)
   UPSERT updateRows but strip import_session_id from the payload so PostgREST
   does not overwrite the original session pointer
```

Track and return:
- `newRows` (true inserts this run)
- `updatedRows` (already existed; refreshed in place)
- keep existing `failedBatches`, `errors`, `intraBatchDuplicates`

Session row update uses `newRows` (not affected count) for `inserted_rows`, so the counter reflects what this session actually owns.

**2. Client `IndependentExpenditureImportCard.tsx`**

- Add `updated` to the running stats object.
- Accumulate `s.inserted += data.newRows` and `s.updated += data.updatedRows`.
- Render both in the result panel: e.g. `1,234 new · 11,358 updated · 0 skipped`.

### Files touched
- `supabase/functions/import-fec-schedule-e-csv/index.ts`
- `src/components/admin/IndependentExpenditureImportCard.tsx`

No DB migration needed. The unique index already guarantees no duplicates.
