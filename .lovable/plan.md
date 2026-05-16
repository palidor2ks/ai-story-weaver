# Donor Import Safety: Cycle Guard + Undo Last Import

Prevent wrong-cycle imports before they happen, and provide a one-click rollback for the most recent import when something slips through.

## Part A — Cycle-mismatch guard (importer)

**Goal:** Reject (or warn loudly) when the CSV's reported cycle/year doesn't match the cycle selected in the UI.

**Where:** `supabase/functions/import-fec-receipts-csv/index.ts` + `src/components/admin/DonorImportPanel.tsx`.

**Logic:**
1. Each FEC receipt row has `two_year_transaction_period` (e.g. `2024`) and/or `report_year`. Today the edge function falls back to selected `cycle` per-row but never compares the two.
2. In the importer, before inserting any batch, compute the dominant `two_year_transaction_period` across the file (sample first 500 rows client-side during file parse).
3. If dominant period ≠ selected cycle:
   - Block import by default; show a confirmation modal: "This file looks like cycle X but you selected Y. Continue anyway? (typing X to confirm)".
   - If user confirms, proceed and tag every row with the user-selected cycle (current behavior).
4. Edge function adds a server-side guard too: if >20% of rows have a `two_year_transaction_period` that disagrees with the request `cycle` AND no `force=true` flag is set, return HTTP 409 with the mismatch summary. Client surfaces it as the same modal.
5. Add a `Detected cycle:` line in the file-preview area (next to existing detected committee), so the mismatch is visible before clicking Import.

## Part B — Undo Last Import (admin action)

**Goal:** Roll back the most recent donor import for a candidate × cycle with one click.

### Schema change

New table `donor_import_sessions` keyed by the existing client `sessionId`:

| column | type | notes |
|---|---|---|
| id | uuid PK | matches the existing `sessionId` from `DonorImportPanel` |
| candidate_id | text | from request |
| committee_id | text | nullable for multi-committee |
| cycle | text | the cycle the user selected |
| filename | text | for display |
| row_count | int | rows submitted |
| inserted_contributions | int | filled in on completion |
| status | text | `running` / `completed` / `cancelled` / `failed` |
| started_by | uuid | `auth.uid()` |
| started_at, completed_at | timestamptz | |

Add column to existing tables to tag every row written by an import:
- `contributions.import_session_id uuid` (nullable, indexed)
- `donors.import_session_id uuid` (nullable, indexed) — only set when donor row was created by this session

RLS: admins only (insert/select/update/delete). Service role full.

### Importer changes
- Client already generates `sessionId`; pass it in every batch request (already partially threaded).
- Edge function:
  - On first batch: upsert `donor_import_sessions` row with `status=running`.
  - On every insert into `contributions` and `donors`: set `import_session_id = sessionId`.
  - On completion / cancel: update status + `inserted_contributions`.

### Undo action

New admin RPC `undo_donor_import(p_session_id uuid)` (SECURITY DEFINER, admin-only via `has_role`):
1. Load session row; refuse if older than 24h (configurable) or if `status='undone'`.
2. `DELETE FROM contributions WHERE import_session_id = p_session_id` — capture deleted count.
3. For donors created by this session, decrement `transaction_count` / recompute or delete if no remaining contributions reference them. Simpler v1: `DELETE FROM donors WHERE import_session_id = p_session_id AND NOT EXISTS (...remaining contributions...)`.
4. Recompute `committee_finance_rollups` and `finance_reconciliation` for the affected `(candidate_id, cycle)` by calling existing recompute edge function / RPC.
5. Mark session `status='undone'`.
6. Return summary `{ deleted_contributions, deleted_donors, recomputed }`.

### UI

In `DonorImportPanel.tsx`, after the existing import-stats block, add a "Recent imports" card showing the last 10 sessions for the selected candidate (or all if none selected):
- Columns: when, filename, candidate, committee, cycle, rows, status
- Each row gets an **Undo** button (disabled if older than 24h or already undone).
- Confirm dialog: "Delete N contributions and M donors imported on {date}? This cannot be reversed."
- On success: toast + refresh list + refresh AnswerCoveragePanel finance cycles.

## Technical details

- Sample-based cycle detection (first 500 parsed rows) avoids re-streaming the whole file client-side.
- The 20% mismatch threshold tolerates the few legitimate cross-period rows FEC files sometimes contain (late refunds, etc.).
- `import_session_id` indexes are critical — undo must be fast even on 100k-row imports.
- The recompute step after undo reuses the existing `refresh-fec-totals` / committee rollup logic; do not re-implement.
- Session age cap (24h default) prevents accidentally nuking weeks-old data; admins can still issue a manual migration for anything older.

## Out of scope

- Bulk undo across multiple sessions
- Restoring an undone import
- Per-row diff / preview before undo
