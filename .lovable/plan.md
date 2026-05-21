## Add Recent Imports section to Independent Expenditures importer

Mirror the donor importer's history + undo pattern for FEC Schedule E uploads.

### 1. Database migration

Create `ie_import_sessions` table:
- `id` (text, PK — client-generated like donor sessions)
- `cycle`, `filename`, `row_count`, `inserted_rows`, `updated_rows`, `detected_cycle`
- `status` (`running` | `completed` | `failed` | `undone`)
- `started_at`, `completed_at`, `undone_at`, `undo_summary` (jsonb)
- `created_by` (uuid)

RLS: admin-only select/insert/update (matching `donor_import_sessions` policy).

Add `import_session_id text` column + index to `independent_expenditures`.

Create `undo_ie_import(p_session_id text)` SECURITY DEFINER function:
- Admin-only guard via `has_role`.
- Deletes from `independent_expenditures where import_session_id = p_session_id`.
- Marks session `status='undone'`, sets `undo_summary`.

### 2. Edge function update — `import-fec-schedule-e-csv`

- Accept `sessionId` (required), `isFirstBatch`, `isLastBatch`, `filename` (already partly present).
- On first batch: insert `ie_import_sessions` row with `status='running'`.
- On every batch: stamp `import_session_id = sessionId` on each upserted row and increment `inserted_rows` / `updated_rows` on the session via update.
- On last batch (or explicit `finalize`): set `status='completed'`, `completed_at=now()`.
- On error: set `status='failed'`.

### 3. Frontend

New component `src/components/admin/IndependentExpenditureImportHistory.tsx`:
- Clone of `DonorImportHistory` adapted to `ie_import_sessions` and `undo_ie_import` RPC.
- Columns: When · File · Cycle (+ detected mismatch badge) · Rows · Inserted · Status · Undo.
- 72h undo window, refresh button, same toast/alert-dialog UX.

Update `IndependentExpenditureImportCard.tsx`:
- Generate `sessionId` per upload (uuid).
- Send `sessionId`, `isFirstBatch`, `isLastBatch`, `filename` to the edge function.
- After completion, bump a `refreshKey` to reload the new history component.

Update `src/pages/Admin.tsx` (donor-import tab):
- Render `<IndependentExpenditureImportHistory />` directly below the existing `<IndependentExpenditureImportCard />`.

### Notes
- No changes to the read-side IE views/hooks.
- Existing IE rows without `import_session_id` are simply not undoable — acceptable.