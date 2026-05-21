# Independent Expenditures Integration Plan

## What was added now
- New schema table: `public.independent_expenditures` with:
  - direct connection to the spending committee (`committee_id` + `spending_committee_fec_id`)
  - direct connection to the targeted candidate (`candidate_id` + `target_fec_candidate_id`)
  - support/oppose flag (`support_oppose_indicator` = `S`/`O`)
  - idempotency key (`UNIQUE (fec_transaction_id, spending_committee_fec_id)`)
- Rollup views for profile pages:
  - `public.committee_independent_expenditure_totals`
  - `public.candidate_independent_expenditure_totals`

## Best way to connect this end-to-end

### 1) Import source strategy
Use the FEC processed independent expenditures endpoint as the source of truth:
- `data_type=processed`
- `most_recent=true`
- `is_notice=true`
- `min_amount=50000`

Recommended import flow:
1. Pull rows from FEC endpoint.
2. Normalize and upsert each row into `independent_expenditures`.
3. Resolve `committee_id` by matching `spending_committee_fec_id` to `committees.fec_committee_id`.
4. Resolve `candidate_id` by matching `target_fec_candidate_id` to `candidate_fec_ids.fec_candidate_id`.
5. Save full source row in `raw_payload` for debugging and later parsing improvements.

### 2) Admin page import function
Add an admin panel card similar to the donor import flow that:
- accepts cycle/date filters and a minimum amount
- calls a Supabase Edge Function (recommended name: `import-independent-expenditures`)
- displays imported / updated / skipped counts
- captures unmapped committee IDs and candidate IDs for reconciliation

### 3) Committee profile integration
On `CommitteeProfile`, query `committee_independent_expenditure_totals` by `committee_id` and show:
- Total independent expenditures
- Amount supporting candidates
- Amount opposing candidates
- Count of filings

Optionally add a detail table from `independent_expenditures` filtered by `committee_id`.

### 4) Candidate profile integration
On `CandidateProfile`, query `candidate_independent_expenditure_totals` by `candidate_id` and show:
- Total spent for/against this candidate
- For amount vs against amount
- Count of filings

Optionally add top spending committees against/for the candidate.

### 5) Data quality and reconciliation
Track unresolved mappings:
- rows with `committee_id IS NULL`
- rows with `candidate_id IS NULL`

Build a small admin reconciliation UI to manually map unmatched committee/candidate IDs and re-run a relink job.

## Why this is the best fit for current architecture
- Aligns with existing FEC-based committee and candidate ID patterns already in the app.
- Keeps ingestion idempotent and auditable (`raw_payload`, unique key).
- Makes profile page read paths simple and fast via rollup views.
- Keeps admin workflow consistent with current import panels.
