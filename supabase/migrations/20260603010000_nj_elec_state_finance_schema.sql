-- NJ ELEC (Election Law Enforcement Commission) state campaign-finance ingestion.
-- Source: njelecefilesearch.com JSON API (state-level data the FEC does NOT cover).
-- Deliberately ISOLATED from the federal/FEC pipeline: dedicated nj_elec_* tables,
-- never reconciled against the existing `contributions` / `donors` / `candidates` tables.

-- ---------------------------------------------------------------------------
-- Entities = NJ state candidates / committees (one row per entity per election)
-- ---------------------------------------------------------------------------
create table if not exists public.nj_elec_entities (
  entity_s            text primary key,        -- ELEC entity key (e.g. "449739")
  entity_name         text not null,           -- "LAST, FIRST" or committee/PAC name
  entity_first_name   text,
  entity_last_name    text,
  office_code         text,                    -- '1'=STATE SENATE, '2'=STATE ASSEMBLY, ...
  office              text,
  party_code          text,
  party               text,
  location            text,                    -- "39TH LEGISLATIVE DISTRICT"
  location_code       text,                    -- district number as text ("39")
  election_year       int,
  election_type_code  text,                    -- 'G','P',...
  election_type       text,                    -- "GENERAL","PRIMARY"
  entity_id           text,                    -- composite "2*39*1*2*G*2023*0"
  total_contributions numeric,
  total_expenditures  numeric,
  raw                 jsonb,
  first_seen_at       timestamptz not null default now(),
  last_synced_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Itemized contributions received by an entity
-- ---------------------------------------------------------------------------
create table if not exists public.nj_elec_contributions (
  contrib_s           bigint primary key,      -- ELEC unique contribution id (dedup/upsert key)
  entity_s            text not null references public.nj_elec_entities(entity_s) on delete cascade,
  contributor         text,
  is_individual       boolean,
  first_name          text,
  middle_init         text,
  last_name           text,
  suffix              text,
  non_ind_name        text,
  street1             text,
  street2             text,
  city                text,
  state               text,
  zip                 text,
  cont_type           text,                    -- 'A' individual, 'C' committee, ...
  contributor_type    text,                    -- "INDIVIDUAL","POLITICAL PARTY CMTE",...
  contribution_type   text,                    -- "MONETARY","IN-KIND",...
  emp_name            text,
  emp_city            text,
  emp_state           text,
  occupation_code     text,
  occupation_name     text,
  cont_date           date,
  cont_amt            numeric,
  cand_name           text,                    -- recipient legislator
  election_year       int,
  office_code         text,
  party_code          text,
  election_type_code  text,
  raw                 jsonb,                   -- full source record for fidelity
  synced_at           timestamptz not null default now()
);

create index if not exists idx_nj_elec_contrib_entity on public.nj_elec_contributions(entity_s);
create index if not exists idx_nj_elec_contrib_year   on public.nj_elec_contributions(election_year);
create index if not exists idx_nj_elec_contrib_date   on public.nj_elec_contributions(cont_date);
create index if not exists idx_nj_elec_entities_office_year on public.nj_elec_entities(office_code, election_year);

-- ---------------------------------------------------------------------------
-- Sync run log
-- ---------------------------------------------------------------------------
create table if not exists public.nj_elec_sync_runs (
  id                     bigint generated always as identity primary key,
  started_at             timestamptz not null default now(),
  finished_at            timestamptz,
  status                 text not null default 'running',  -- running|success|error
  office_codes           text[],
  election_years         int[],
  entities_upserted      int default 0,
  contributions_upserted int default 0,
  error                  text,
  notes                  jsonb
);

-- ---------------------------------------------------------------------------
-- RLS: public campaign-finance data is read-only to clients; only the
-- service_role (used by the edge function) writes — and it bypasses RLS.
-- ---------------------------------------------------------------------------
alter table public.nj_elec_entities      enable row level security;
alter table public.nj_elec_contributions enable row level security;
alter table public.nj_elec_sync_runs     enable row level security;

drop policy if exists nj_elec_entities_read on public.nj_elec_entities;
create policy nj_elec_entities_read on public.nj_elec_entities for select using (true);

drop policy if exists nj_elec_contributions_read on public.nj_elec_contributions;
create policy nj_elec_contributions_read on public.nj_elec_contributions for select using (true);
-- nj_elec_sync_runs: no public policy → internal/service_role only.
