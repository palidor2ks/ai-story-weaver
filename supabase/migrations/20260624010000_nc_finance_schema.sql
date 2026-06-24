-- North Carolina State Board of Elections (NCSBE) state campaign-finance ingestion.
-- Source: NCSBE bulk annual contribution CSVs distributed as ZIP files.
-- Download URL: https://s3.amazonaws.com/dl.ncsbe.gov/campaign-finance/year/{year}/NC-FullContributionsAllCounties-{year}.zip
-- State-level data the FEC does NOT cover (NC State Senate + NC House of Representatives).
-- Deliberately ISOLATED from the federal FEC pipeline — dedicated nc_* tables, never reconciled
-- against the existing contributions / donors / candidates tables. Mirrors FL/NJ/NY/TX pattern.
--
-- Unlike TX (sharded bulk ZIP) or NY (per-filer Socrata API), NCSBE publishes one CSV per year
-- for all counties. Ingest unit = year. The drain processes one year's CSV per invocation with a
-- row-count resume cursor for large files that exceed the 110s edge-function budget.

-- ---------------------------------------------------------------------------
-- Per-year ingest progress — lets the drain resume across cron runs.
-- ---------------------------------------------------------------------------
create table if not exists public.nc_sync_progress (
  year         int primary key,
  status       text not null default 'pending',  -- pending | running | done | error
  rows_done    int not null default 0,            -- resume cursor (data rows already upserted)
  rows_upserted int not null default 0,
  last_run_at  timestamptz,
  error        text
);

-- ---------------------------------------------------------------------------
-- Itemized contributions from NCSBE annual files. PK uses year + 1-based row
-- number within that year's CSV, which is stable across re-runs (NCSBE files
-- are append-only within a year and immutable once the year closes).
-- ---------------------------------------------------------------------------
create table if not exists public.nc_contributions (
  id                      text primary key,        -- "{year}-{row_num}"
  source_year             int not null,            -- calendar year of the annual file
  account_code            text,                    -- committee/filer registration ID
  committee_name          text,                    -- filer committee name
  candidate_full_name     text,                    -- "First Last" — used for name matching
  candidate_first_name    text,
  candidate_last_name     text,
  office_code             text,                    -- SEN | REP (derived from office)
  office_raw              text,                    -- "N.C. Senate" / "N.C. House of Representatives"
  district                int,                     -- numeric district from jurisdiction field
  jurisdiction            text,                    -- raw, e.g. "Senate District 1"
  party                   text,                    -- DEM/REP/LIB/UNA/GRE/OTH
  contributor             text,                    -- contributor_full_name
  contributor_type        text,                    -- IND/BUS/PAC/PTY/CTY/OTH/SCC/CAN/RAD
  is_individual           boolean,
  city                    text,
  state                   text,
  zip                     text,
  employer                text,
  amount                  numeric,
  date_occurred           date,
  election_year           int,                     -- from date_occurred or election_cycle fields
  report_name             text,
  synced_at               timestamptz not null default now()
);

create index if not exists idx_nc_contrib_candidate   on public.nc_contributions (candidate_last_name);
create index if not exists idx_nc_contrib_office      on public.nc_contributions (office_code, district);
create index if not exists idx_nc_contrib_year        on public.nc_contributions (source_year);
create index if not exists idx_nc_contrib_date        on public.nc_contributions (date_occurred);

-- ---------------------------------------------------------------------------
-- Sync run log
-- ---------------------------------------------------------------------------
create table if not exists public.nc_sync_runs (
  id                     bigint generated always as identity primary key,
  started_at             timestamptz not null default now(),
  finished_at            timestamptz,
  status                 text not null default 'running',  -- running|success|success_with_errors|error
  mode                   text,
  years_processed        int[],
  contributions_upserted int default 0,
  remaining              int,
  error                  text,
  notes                  jsonb
);

-- ---------------------------------------------------------------------------
-- RLS: public campaign-finance data is read-only to clients; only the
-- service_role (used by the edge function) writes — and it bypasses RLS.
-- nc_sync_progress / nc_sync_runs: no public read policy → internal only.
-- ---------------------------------------------------------------------------
alter table public.nc_sync_progress  enable row level security;
alter table public.nc_contributions  enable row level security;
alter table public.nc_sync_runs      enable row level security;

drop policy if exists nc_contributions_read on public.nc_contributions;
create policy nc_contributions_read on public.nc_contributions for select using (true);
-- nc_sync_progress / nc_sync_runs: no public policy → service_role only.

-- ---------------------------------------------------------------------------
-- Auth gate for fetch-nc-finance edge function. Validates a caller-supplied
-- token against a Vault-stored shared secret ('nc_sync_secret'). SECURITY
-- DEFINER so it can read Vault; EXECUTE restricted to service_role so anon
-- callers cannot brute-force the secret. The secret value itself is created
-- out-of-band in Vault (never committed to source) — see fetch-tx-finance
-- pattern in docs for the vault.create_secret() invocation.
-- ---------------------------------------------------------------------------
create or replace function public.check_nc_sync_secret(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'nc_sync_secret' and decrypted_secret = p_token
  );
$$;

revoke all on function public.check_nc_sync_secret(text) from public;
grant execute on function public.check_nc_sync_secret(text) to service_role;
