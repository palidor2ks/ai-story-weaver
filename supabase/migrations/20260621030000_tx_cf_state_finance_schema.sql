-- Texas Ethics Commission (TEC) state campaign-finance ingestion.
-- Source: the TEC bulk database ZIP (TEC_CF_CSV.zip), electronically-filed reports
-- since 2000-07-01. State-level data the FEC does NOT cover.
-- Deliberately ISOLATED from the federal/FEC pipeline (dedicated tx_cf_* tables,
-- never reconciled against the existing contributions / donors / candidates tables),
-- mirroring the NJ (nj_elec_*) and FL (fl_*) reference implementations.
--
-- Unlike NJ/FL (per-entity scrape of a search app), TEC publishes ONE bulk ZIP whose
-- contributions are pre-sharded into contribs_##.csv. So the ingest unit is the CSV
-- shard: drain processes shards one at a time and records progress for resumability.
--
-- TEC record layout: https://www.ethics.state.tx.us/data/search/cf/CFS-ReadMe.txt

-- ---------------------------------------------------------------------------
-- Filers = TEC filing accounts (candidates / committees). From filers.csv.
-- office_* come from the CTA (campaign-treasurer-appointment) "office sought"
-- fields — the join path to our TX legislative candidates (office + district).
-- ---------------------------------------------------------------------------
create table if not exists public.tx_cf_filers (
  filer_ident            text primary key,        -- TEC filer account # (filerIdent)
  filer_name             text not null,           -- filerName
  filer_type_cd          text,                    -- filerTypeCd
  filer_persent_type_cd  text,                    -- INDIVIDUAL | ENTITY
  office_cd              text,                    -- ctaSeekOfficeCd (office sought)
  office_district        text,                    -- ctaSeekOfficeDistrict
  office_place           text,                    -- ctaSeekOfficePlace
  office_descr           text,                    -- ctaSeekOfficeDescr (human-readable)
  raw                    jsonb,                   -- full source record for fidelity
  first_seen_at          timestamptz not null default now(),
  last_synced_at         timestamptz not null default now()
);

create index if not exists idx_tx_cf_filers_office
  on public.tx_cf_filers (office_cd, office_district);

-- ---------------------------------------------------------------------------
-- Itemized contributions (Schedules A/C). From contribs_##.csv (+ cont_ss/cont_t,
-- tracked via source_file so special-session/pre-election rows stay distinguishable —
-- TEC keeps them separate to avoid double-counting re-reported amounts).
-- ---------------------------------------------------------------------------
create table if not exists public.tx_cf_contributions (
  contribution_info_id          bigint primary key,  -- contributionInfoId (idempotent upsert key)
  report_info_ident             bigint,              -- reportInfoIdent (unique report #)
  filer_ident                   text not null,       -- filerIdent (join to tx_cf_filers; no hard FK:
                                                     -- bulk load order is source-driven, don't block ingest)
  filer_name                    text,                -- filerName (denormalized for resilience)
  contribution_dt               date,                -- contributionDt
  contribution_amount           numeric,             -- contributionAmount
  contribution_descr            text,                -- contributionDescr (in-kind detail, etc.)
  itemize_flag                  boolean,             -- itemizeFlag = Y
  contributor_persent_type_cd   text,                -- INDIVIDUAL | ENTITY
  contributor_name_organization text,                -- contributorNameOrganization (ENTITY)
  contributor_name_last         text,                -- contributorNameLast (INDIVIDUAL)
  source_file                   text,                -- contribs_##.csv | cont_ss.csv | cont_t.csv
  raw                           jsonb,               -- full source record for fidelity
  synced_at                     timestamptz not null default now()
);

create index if not exists idx_tx_cf_contrib_filer on public.tx_cf_contributions (filer_ident);
create index if not exists idx_tx_cf_contrib_date  on public.tx_cf_contributions (contribution_dt);

-- ---------------------------------------------------------------------------
-- Per-shard ingest progress — lets the drain resume across cron runs and
-- re-detect a freshly published ZIP (by its Last-Modified) without re-doing
-- shards already loaded from the same dump.
-- ---------------------------------------------------------------------------
create table if not exists public.tx_cf_shard_progress (
  source_file        text primary key,             -- e.g. 'contribs_07.csv'
  zip_last_modified  text,                          -- Last-Modified of the ZIP this shard came from
  status             text not null default 'pending', -- pending | done | error
  rows_done          int not null default 0,        -- intra-shard resume cursor (data rows already upserted)
  rows_upserted      int default 0,
  last_run_at        timestamptz,
  error              text
);

-- ---------------------------------------------------------------------------
-- Sync run log
-- ---------------------------------------------------------------------------
create table if not exists public.tx_cf_sync_runs (
  id                     bigint generated always as identity primary key,
  started_at             timestamptz not null default now(),
  finished_at            timestamptz,
  status                 text not null default 'running',  -- running | success | error
  mode                   text,                              -- discover | drain | full
  zip_last_modified      text,                              -- dump version processed
  shards_processed       text[],
  filers_upserted        int default 0,
  contributions_upserted int default 0,
  error                  text,
  notes                  jsonb
);

-- ---------------------------------------------------------------------------
-- RLS: public campaign-finance data is read-only to clients; only the
-- service_role (used by the edge function) writes — and it bypasses RLS.
-- Progress / run-log tables are internal (no public policy).
-- ---------------------------------------------------------------------------
alter table public.tx_cf_filers          enable row level security;
alter table public.tx_cf_contributions   enable row level security;
alter table public.tx_cf_shard_progress  enable row level security;
alter table public.tx_cf_sync_runs        enable row level security;

drop policy if exists tx_cf_filers_read on public.tx_cf_filers;
create policy tx_cf_filers_read on public.tx_cf_filers for select using (true);

drop policy if exists tx_cf_contributions_read on public.tx_cf_contributions;
create policy tx_cf_contributions_read on public.tx_cf_contributions for select using (true);
-- tx_cf_shard_progress / tx_cf_sync_runs: no public policy → internal/service_role only.
