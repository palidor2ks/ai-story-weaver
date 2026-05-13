# Mass-import donations across multiple candidates

Let one CSV upload hold rows for many committees. Each row is routed to its candidate based on its own `committee_id`, using the existing `candidate_committees` mapping. Unmapped rows are imported as orphans (`candidate_id = null`) and reported back so they can be mapped later.

## UI changes — `src/components/admin/DonorImportPanel.tsx`

1. Add a **"Multi-committee mode"** toggle (Switch) at the top of the panel.
2. When ON:
   - Hide the single `committeeId` / `candidateId` inputs and the "detected committee" panel.
   - On file select, scan the first ~2000 rows, collect distinct `committee_id` values, look them up in `candidate_committees`, and show a small preview table: committee_id → candidate name (or "Unmapped — will import as orphan").
   - Show a count of mapped vs unmapped committees.
3. When sending each batch to the edge function, pass `multiCommittee: true` and omit top-level `committeeId` / `candidateId`.
4. Extend the result stats to show: contributions per committee, and a list of unmapped committee_ids encountered.

## Edge function changes — `supabase/functions/import-fec-receipts-csv/index.ts`

1. Accept new body field `multiCommittee: boolean`.
2. When `multiCommittee` is true:
   - Ignore top-level `candidateId` / `committeeId`.
   - Collect distinct `committee_id` values from the batch's rows.
   - One `candidate_committees` query: `select fec_committee_id, candidate_id where fec_committee_id in (...)`. Build an in-memory map. Cache per invocation.
   - For each row, resolve `recipient_committee_id` from the row, then `candidate_id` from the map (or `null` if unmapped).
3. Return new fields in the response:
   - `committeeBreakdown`: `{ [committeeId]: { rows, inserted, candidate_id|null } }`
   - `unmappedCommittees`: string[]
4. Single-committee mode keeps current behavior unchanged.

## Aggregation in the panel

Accumulate `committeeBreakdown` and `unmappedCommittees` across batches and render after import:
- Per-committee inserted-contributions table.
- Collapsible "Unmapped committee_ids" list with copy-to-clipboard, so the admin can add `candidate_committees` rows and re-run.

## Out of scope

- No schema changes (everything fits existing tables).
- No multi-file queueing (single CSV with mixed committees).
- Reconciliation / rollup recalculation is unchanged — it already keys off `candidate_id` and `committee_id`, so newly imported rows flow through normally.
