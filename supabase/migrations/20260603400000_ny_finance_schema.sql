-- New York state campaign-finance ingestion. Source: data.ny.gov (Socrata),
-- the NY State Board of Elections disclosure datasets, queried via the SODA
-- JSON API ($where/$limit/$offset). State-level data the FEC does NOT cover
-- (NY State Senate + State Assembly).
--
-- Datasets:
--   7x2g-h32p  Campaign Finance Filer Data (the committee/candidate registry;
--              office_desc + district let us scope to the state legislature)
--   e9ss-239a  Campaign Finance Disclosure Reports (itemized transactions;
--              monetary contributions are filing schedules A/B/C)
--
-- Deliberately ISOLATED from the federal FEC, NJ ELEC, and FL pipelines:
-- dedicated ny_* tables. Ingestion unit = filer (committee); the drain pulls a
-- filer's contributions via the SODA API (paginated). NY gives a stable
-- per-row trans_number, so dedup is exact (no hashing like FL).

-- ---------------------------------------------------------------------------
-- Filers = NY state-legislative candidate/committee registry + drain queue
-- ---------------------------------------------------------------------------
create table if not exists public.ny_filers (
  filer_id             text primary key,
  filer_name           text,
  office_desc          text,                 -- 'State Senator' | 'Member of Assembly'
  office_code          text,                 -- 'SEN' | 'ASM'
  district             int,
  committee_type_desc  text,
  filer_type_desc      text,
  filer_status         text,                 -- 'ACTIVE' | ...
  contrib_synced_at    timestamptz,          -- cursor; null = needs sync
  last_contrib_count   int,
  first_seen_at        timestamptz not null default now(),
  last_synced_at       timestamptz
);

-- ---------------------------------------------------------------------------
-- Itemized monetary contributions received by a filer (schedules A/B/C)
-- ---------------------------------------------------------------------------
create table if not exists public.ny_contributions (
  trans_number        text primary key,      -- NY transaction id (exact dedup key)
  filer_id            text not null references public.ny_filers(filer_id) on delete cascade,
  cand_comm_name      text,                  -- recipient committee name
  contributor         text,                  -- display name (org, or "First Last")
  contributor_first   text,
  contributor_last    text,
  contributor_org     text,
  contributor_type    text,                  -- cntrbr_type_desc ("Individual",...)
  is_individual       boolean,
  city                text,
  state               text,
  zip                 text,
  amount              numeric,               -- org_amt
  sched_date          date,
  election_year       int,
  election_type       text,
  filing_sched_abbrev text,                  -- 'A' | 'B' | 'C'
  payment_type        text,
  raw                 jsonb,
  synced_at           timestamptz not null default now()
);

create index if not exists idx_ny_contrib_filer on public.ny_contributions(filer_id);
create index if not exists idx_ny_contrib_year  on public.ny_contributions(election_year);
create index if not exists idx_ny_filers_office_district on public.ny_filers(office_code, district);
create index if not exists idx_ny_filers_cursor on public.ny_filers(contrib_synced_at);

-- ---------------------------------------------------------------------------
-- Sync run log
-- ---------------------------------------------------------------------------
create table if not exists public.ny_sync_runs (
  id                     bigint generated always as identity primary key,
  started_at             timestamptz not null default now(),
  finished_at            timestamptz,
  status                 text not null default 'running',
  mode                   text,
  filers_upserted        int default 0,
  filers_processed       int default 0,
  contributions_upserted int default 0,
  remaining              int,
  error                  text,
  notes                  jsonb
);

-- ---------------------------------------------------------------------------
-- RLS: public read; only the service_role (edge function) writes.
-- ---------------------------------------------------------------------------
alter table public.ny_filers        enable row level security;
alter table public.ny_contributions enable row level security;
alter table public.ny_sync_runs     enable row level security;

drop policy if exists ny_filers_read on public.ny_filers;
create policy ny_filers_read on public.ny_filers for select using (true);

drop policy if exists ny_contributions_read on public.ny_contributions;
create policy ny_contributions_read on public.ny_contributions for select using (true);
-- ny_sync_runs: no public policy → internal/service_role only.
