## Implement PR #80 — Independent Expenditures (FEC outside spending)

PR #80 only adds a schema + a planning doc. This plan implements the full end-to-end feature it describes.

### 1. Database migration

Create `public.independent_expenditures` with columns:
- `fec_transaction_id`, `image_number`, `expenditure_date`, `cycle`, `amount`, `purpose`, `communication_type`
- `support_oppose_indicator` ('S'/'O')
- `spending_committee_fec_id`, `spending_committee_name`, `committee_id` → `committees.id`
- `target_fec_candidate_id`, `target_candidate_name`, `candidate_id` → `candidates.id`
- `state`, `office`, `district`, `election_type`, `report_type`, `raw_payload`, `source`
- Unique `(fec_transaction_id, spending_committee_fec_id)`, indexes on lookup columns
- RLS: public read; admins manage (using existing `has_role`/`is_admin`)
- Trigger to maintain `updated_at`
- Two views: `committee_independent_expenditure_totals`, `candidate_independent_expenditure_totals` (count, total, support, oppose)

### 2. Edge function `import-independent-expenditures`

- Inputs: `cycle`, optional `min_amount` (default 50000), optional `min_date`, `max_pages`
- Calls FEC `/schedules/schedule_e/` with `data_type=processed`, `most_recent=true`, `is_notice=true`, `min_amount`, `two_year_transaction_period={cycle}`, pagination via `last_indexes`
- Uses `FEC_API_KEY` secret (already configured in project — verify; otherwise add)
- For each row: normalize → resolve `committee_id` from `committees.fec_committee_id`, `candidate_id` from `candidate_fec_ids.fec_candidate_id` → upsert by `(fec_transaction_id, spending_committee_fec_id)` storing full payload in `raw_payload`
- Return counts: inserted, updated, skipped, unmapped_committees, unmapped_candidates
- Admin-only (verify caller has admin role)
- Uses `EdgeRuntime.waitUntil` + batching per project conventions

### 3. Admin UI

Add a new admin card `IndependentExpenditureImportCard.tsx` (rendered in the admin Finance/Imports area) with:
- cycle selector (reuses `useFinanceCycles`), min-amount input, run button
- progress + last-run summary (inserted/updated/skipped/unmapped)
- link to a small unmapped-reconciliation table (query rows where `committee_id IS NULL` or `candidate_id IS NULL`)

### 4. Profile integration

- New hook `useIndependentExpenditures.ts` exposing per-committee and per-candidate totals + top spenders/targets via the rollup views.
- `CommitteeProfile`: add an "Independent Expenditures" section showing total / support / oppose / count and a small table of recent IE rows (`independent_expenditures` filtered by `committee_id`, `order by expenditure_date desc limit 10`).
- `CandidateProfile`: add a "Outside Spending" card showing total for / against / count and the top spending committees grouped by `spending_committee_fec_id`.

All money formatted with existing `fmtMoney` helpers; styling uses semantic tokens already in the design system.

### 5. Sequencing

1. Run migration (separate approval step).
2. After approval: regenerate Supabase types, then add edge function, hook, admin card, profile sections in parallel.
3. Verify build, then user can trigger first import from the admin panel.

### Notes / open items

- PR's Supabase preview failed on an unrelated FK (`candidate_committees_candidate_id_fkey` already exists) — not part of this migration; safe to ignore.
- `candidate_id` is `text` to match the existing `candidates.id` column type used by current FKs.
- If `FEC_API_KEY` is not yet a Supabase secret, I'll add it via the secrets tool before deploying the function.
