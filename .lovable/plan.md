## Why only 592 of 12,592 inserted

The `import-fec-schedule-e-csv` edge function upserts each 500-row batch with `onConflict: 'fec_transaction_id, spending_committee_fec_id'`. Postgres rejects an upsert if the same conflict key appears twice in one statement ("ON CONFLICT DO UPDATE command cannot affect row a second time"), which fails the **entire batch**.

Two things drive duplicates in FEC Schedule E data:
1. The normalizer picks `tra_id` first for `fec_transaction_id`. `tra_id` is **not unique** in Schedule E — amendments and multi-line filings repeat it. `sub_id` is the truly unique row identifier in FEC bulk data.
2. Even using sub_id, the same row can appear across original + amended filings.

Result: the first 500-row batch happened to be clean → 500 inserted. Subsequent batches hit duplicates and silently failed (errors collected but not surfaced as inserted=0). Final session shows `inserted_rows: 592`, DB has 675 rows (overlap with a prior session).

## Plan

### 1. Prefer `sub_id` as the transaction id
In `normalizeRow`, change the priority so `sub_id` wins over `tra_id`:
```ts
const fec_transaction_id = pick(row, ['sub_id', 'SUB_ID', 'tra_id', 'transaction_id', 'fec_transaction_id']);
```
`sub_id` is the FEC bulk-data primary key for Schedule E and is globally unique.

### 2. Dedupe within each batch before upsert
Even with sub_id, build a `Map` keyed by `${fec_transaction_id}|${spending_committee_fec_id}` and keep the **last** occurrence (so a later amended row in the file wins over an earlier one). Then upsert the deduped slice.

### 3. Surface batch errors to the user
Currently a failed batch is recorded in `errors[]` but the UI only shows "completed". Two small changes:
- In the edge function, include `failedBatches` count in the response and roll it up on the session row (add a `failed_rows` field via migration, or stash in `undo_summary`).
- In `IndependentExpenditureImportCard.tsx`, if `errors.length > 0` show the batch error list prominently and mark the import as "completed with errors".

### 4. Backfill the missing 12k rows
After the fix ships, re-run the same CSV. The unique index will absorb the 675 already-loaded rows; the rest will insert cleanly.

## Files touched

- `supabase/functions/import-fec-schedule-e-csv/index.ts` — sub_id priority, in-batch dedupe, richer response
- `src/components/admin/IndependentExpenditureImportCard.tsx` — show batch errors

No DB migration required (optional `failed_rows` column can be added later if you want it tracked on the session row).
