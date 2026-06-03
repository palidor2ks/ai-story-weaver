-- Florida Division of Elections state campaign-finance ingestion.
-- Source: dos.elections.myflorida.com  /cgi-bin/contrib.exe  (the public
-- "Contributions" query, tab-delimited export — queryformat=2). State-level
-- data the FEC does NOT cover (FL State Representative / State Senator).
--
-- Deliberately ISOLATED from the federal FEC pipeline AND from the NJ ELEC
-- pipeline: dedicated fl_* tables, never reconciled against the existing
-- federal `contributions` / `donors` / `candidates` tables.
--
-- FL's CGI has no pagination (only `rowlimit`) and its output omits district,
-- so the ingestion unit is (election, office, district): one bounded query per
-- unit, with the district attributed from the query context. Office codes:
-- 'STR' = State Representative (120 districts), 'STS' = State Senator (40).

-- ---------------------------------------------------------------------------
-- Work units = (election, office, district). The drain target; one row per
-- bounded query. A null contrib_synced_at means "needs syncing".
-- ---------------------------------------------------------------------------
create table if not exists public.fl_finance_units (
  id                 text primary key,        -- "<election>|<office_code>|<district>"
  election           text not null,           -- "20221108-GEN"
  election_year      int,
  election_label     text,                    -- "2022 General Election"
  office_code        text not null,           -- 'STR' | 'STS'
  office             text,                    -- "State Representative"
  district           int not null,
  contrib_synced_at  timestamptz,             -- cursor; null = unsynced
  last_row_count     int,
  first_seen_at      timestamptz not null default now(),
  last_synced_at     timestamptz
);

-- ---------------------------------------------------------------------------
-- Itemized contributions received by a candidate. FL provides no stable
-- contribution id, so the PK is a deterministic hash of (unit, source line),
-- making re-syncs idempotent.
-- ---------------------------------------------------------------------------
create table if not exists public.fl_contributions (
  id                text primary key,         -- "<unit_id>-<hash(line)>"
  unit_id           text not null references public.fl_finance_units(id) on delete cascade,
  election          text,
  election_year     int,
  office_code       text,                     -- 'STR' | 'STS'
  district          int,
  candidate_raw     text,                     -- "Smith, David  (REP)(STR)"
  candidate_name    text,                     -- "Smith, David"
  candidate_party   text,                     -- "REP" | "DEM" | "NPA" | ...
  cont_date         date,
  amount            numeric,
  typ               text,                     -- CHE|CAS|LOA|COF|INK|... contribution type
  contributor       text,
  address           text,
  city_state_zip    text,
  occupation        text,
  inkind_desc       text,
  is_individual     boolean,
  raw               text,                     -- original tab-delimited line, for fidelity
  synced_at         timestamptz not null default now()
);

create index if not exists idx_fl_contrib_office_district on public.fl_contributions(office_code, district);
create index if not exists idx_fl_contrib_year            on public.fl_contributions(election_year);
create index if not exists idx_fl_contrib_candidate       on public.fl_contributions(candidate_name);
create index if not exists idx_fl_contrib_unit            on public.fl_contributions(unit_id);
create index if not exists idx_fl_units_office_district   on public.fl_finance_units(office_code, district);

-- ---------------------------------------------------------------------------
-- Sync run log
-- ---------------------------------------------------------------------------
create table if not exists public.fl_sync_runs (
  id                     bigint generated always as identity primary key,
  started_at             timestamptz not null default now(),
  finished_at            timestamptz,
  status                 text not null default 'running',  -- running|success|success_with_errors|error
  mode                   text,
  units_upserted         int default 0,
  units_processed        int default 0,
  contributions_upserted int default 0,
  remaining              int,
  error                  text,
  notes                  jsonb
);

-- ---------------------------------------------------------------------------
-- RLS: public campaign-finance data is read-only to clients; only the
-- service_role (used by the edge function) writes — and it bypasses RLS.
-- ---------------------------------------------------------------------------
alter table public.fl_finance_units enable row level security;
alter table public.fl_contributions enable row level security;
alter table public.fl_sync_runs     enable row level security;

drop policy if exists fl_finance_units_read on public.fl_finance_units;
create policy fl_finance_units_read on public.fl_finance_units for select using (true);

drop policy if exists fl_contributions_read on public.fl_contributions;
create policy fl_contributions_read on public.fl_contributions for select using (true);
-- fl_sync_runs: no public policy → internal/service_role only.
