-- Homes for FEC bulk file types that had no target table (loaded by scripts/fec-etl).
-- Public-read, like the other finance tables. Cycle-scoped for re-runnable re-uploads.
-- (Already applied to the dev project via MCP; idempotent here.)

-- cn (candidate master) -> raw FEC candidate reference
create table if not exists public.fec_candidates (
  fec_candidate_id text not null,
  cycle text not null,
  name text,
  party text,
  election_year text,
  office text,
  office_state text,
  office_district text,
  incumbent_challenger text,
  status text,
  principal_committee_id text,
  street_1 text, street_2 text, city text, state text, zip text,
  source text not null default 'fec_bulk',
  updated_at timestamptz not null default now(),
  primary key (fec_candidate_id, cycle)
);
create index if not exists idx_fec_candidates_pcc on public.fec_candidates (principal_committee_id);

-- oth (committee -> committee transactions), filtered to tracked committees
create table if not exists public.fec_committee_transactions (
  sub_id text primary key,
  cycle text not null,
  committee_id text,
  amendment_ind text, report_type text, transaction_pgi text, image_num text,
  transaction_type text, entity_type text,
  name text, city text, state text, zip text, employer text, occupation text,
  transaction_date date, amount integer,
  other_id text,
  tran_id text, file_num text, memo_code text, memo_text text,
  source text not null default 'fec_bulk',
  created_at timestamptz not null default now()
);
create index if not exists idx_fec_cmte_txn_cmte on public.fec_committee_transactions (committee_id, cycle);
create index if not exists idx_fec_cmte_txn_other on public.fec_committee_transactions (other_id, cycle);

-- oppexp (operating expenditures), filtered to tracked committees
create table if not exists public.fec_operating_expenditures (
  sub_id text primary key,
  cycle text not null,
  committee_id text,
  amendment_ind text, report_year text, report_type text, image_num text,
  line_number text, form_type text, schedule_type text,
  payee_name text, city text, state text, zip text,
  transaction_date date, amount integer, transaction_pgi text,
  purpose text, category text, category_desc text,
  memo_code text, memo_text text, entity_type text,
  file_num text, tran_id text, back_ref_tran_id text,
  source text not null default 'fec_bulk',
  created_at timestamptz not null default now()
);
create index if not exists idx_fec_oppexp_cmte on public.fec_operating_expenditures (committee_id, cycle);

-- RLS: public read (matches other FEC/finance reference tables); writes via service role only.
do $$
declare t text;
begin
  foreach t in array array['fec_candidates','fec_committee_transactions','fec_operating_expenditures']
  loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t||'_read') then
      execute format($f$create policy %I on public.%I for select using (true)$f$, t||'_read', t);
    end if;
  end loop;
end $$;
