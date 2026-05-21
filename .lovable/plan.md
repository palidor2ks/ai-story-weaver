# Independent Expenditures — CSV File Import

Replace the API-only `IndependentExpenditureImportCard` flow with a file-upload-driven import that mirrors the existing receipts CSV importer (`DonorImportPanel` → `import-fec-receipts-csv`).

## What changes for the user

In Admin → Donor Import tab, the "Independent Expenditures Import" card becomes a CSV uploader:

- Pick a CSV file (FEC Schedule E bulk export or `oppexp`/`independent_expenditures` CSV from FEC.gov bulk-data or the API CSV export)
- Auto-detect cycle and a sample of spending committees from the first rows
- Choose cycle (defaulted from detection) and optional min-amount filter
- Click **Run import** → rows are streamed in batches to an edge function, with a progress bar, batch counter, inserted/skipped/duplicate counts, and an "unmapped committees / candidates" list at the end

The existing "pull from FEC API" path is removed from this card (the API edge function stays in the repo unused, or we delete it — see Technical).

## Files

**New**
- `supabase/functions/import-fec-schedule-e-csv/index.ts` — admin-gated batch upsert into `independent_expenditures`. Accepts `{ rows, cycle, sessionId, filename, isFirstBatch, force }`. Normalizes FEC Schedule E columns (both bulk pipe-export header names and API CSV header names), resolves `spending_committee_fec_id` → `committees` and `target_fec_candidate_id` → `candidate_fec_ids`, upserts on `(fec_transaction_id, spending_committee_fec_id)`. Returns per-batch counts + unmapped lists. Cycle-mismatch guardrail like `import-fec-receipts-csv`.

**Replaced**
- `src/components/admin/IndependentExpenditureImportCard.tsx` — rewritten as a CSV uploader. Reuses the same UX patterns as `DonorImportPanel`: file picker, first-N-row preview for cycle/committee detection, batch loop (500 rows, ~150ms delay, retry/backoff on 504/546/timeout), progress UI, results summary, debug-copy button.

**Touched**
- `src/pages/Admin.tsx` — no structural change; the card stays in the same tab.
- `supabase/functions/import-independent-expenditures/index.ts` — keep for now (still usable for ad-hoc backfills), or delete if you'd rather only support CSV. Default: keep, but it's no longer wired to UI.

## Technical notes

**Column mapping** (accept both header styles, case-insensitive):

```text
FEC field                          → independent_expenditures column
sub_id / SUB_ID / transaction_id   → fec_transaction_id
image_num / image_number           → image_number
expenditure_dt / expenditure_date  → expenditure_date
two_year_transaction_period/cycle  → cycle
exp_amo / expenditure_amount       → amount
pur / purpose                      → purpose
category_code / communication_type → communication_type
sup_opp / support_oppose_indicator → support_oppose_indicator ('S'|'O')
fec_committee_id / cmte_id         → spending_committee_fec_id
committee_name                     → spending_committee_name
cand_id / candidate_id             → target_fec_candidate_id
candidate_name / cand_name         → target_candidate_name
state / s                          → state
office / cand_office               → office
district / cand_office_district    → district
election_type                      → election_type
rpt_tp / report_type               → report_type
```

Whole raw row is kept in `raw_payload` JSONB.

**Batching**: 500 rows/batch, sequential; retry on WORKER_LIMIT / 504 / 503 / statement timeout (max 5, exponential backoff + jitter) — same constants as donor importer.

**Cycle detection**: dominant value of `two_year_transaction_period` (or year from `expenditure_dt`) across first 2000 rows.

**Min-amount filter**: applied client-side before sending the batch (skip rows where `amount < minAmount`).

**Auth**: edge function requires admin role (same `has_role(auth.uid(),'admin')` gate as `import-independent-expenditures`).

**Unmapped reporting**: edge function returns `unmappedCommittees: string[]` and `unmappedCandidates: string[]` per batch; UI aggregates and shows them so you can fix `committees` / `candidate_fec_ids` mappings.

## Out of scope

- No DB schema changes — `independent_expenditures` already exists with the right unique constraint.
- No changes to `CommitteeProfile` / `CandidateProfile` integration.
- No background job table — same in-browser progress model as donor CSV import.
