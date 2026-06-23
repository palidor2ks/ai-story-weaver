-- NC General Assembly raw-landing schema (beachhead Task 2).
-- Mirrors the isolated-schema pattern (tx_cf_*, fl_*, etc.) — raw data lands here,
-- then final-passage rows are bridged into candidate_votes/bills (Option A, jurisdiction-tagged).
-- Source: OpenStates v3 /bills?include=votes, session=2025.

-- ---------------------------------------------------------------------------
-- Bills in scope (current + future NC GA sessions).
-- bill_id is namespaced: 'nc-{session}-{identifier}' (e.g. 'nc-2025-SB889').
-- os_bill_id is the OpenStates ocd-bill identifier.
-- ---------------------------------------------------------------------------
create table if not exists public.nc_leg_bills (
  bill_id          text primary key,        -- 'nc-2025-SB889'
  os_bill_id       text unique,             -- OpenStates ocd-bill id
  session          text not null,           -- '2025'
  identifier       text not null,           -- 'SB 889'
  chamber_origin   text,                    -- 'upper' | 'lower'
  title            text,
  classification   text[],
  latest_action_at timestamptz,
  topic            text,                    -- hand/auto-assigned for scoring
  raw              jsonb,
  synced_at        timestamptz not null default now()
);

create index if not exists idx_nc_leg_bills_session on public.nc_leg_bills (session);

-- ---------------------------------------------------------------------------
-- One row per roll-call (VoteEvent). is_final_passage marks the determinative
-- reading per bill per chamber (NC: Third Reading or Motion to Concur).
-- Never aggregate across readings — only final-passage rows are bridged.
-- ---------------------------------------------------------------------------
create table if not exists public.nc_leg_vote_events (
  vote_event_id    text primary key,        -- OpenStates VoteEvent id (idempotent key)
  bill_id          text not null references public.nc_leg_bills(bill_id),
  chamber          text,                    -- from VoteEvent.organization ('upper'|'lower')
  motion_text      text,                    -- 'Third Reading', 'Motion to Concur', etc.
  result           text,                    -- 'pass' | 'fail'
  is_final_passage boolean,                 -- true = the determinative reading for this bill/chamber
  start_date       date,
  counts           jsonb,                   -- [{option, value}] totals
  raw              jsonb,
  synced_at        timestamptz not null default now()
);

create index if not exists idx_nc_leg_vote_events_bill_id
  on public.nc_leg_vote_events (bill_id);
create index if not exists idx_nc_leg_vote_events_final_passage
  on public.nc_leg_vote_events (is_final_passage)
  where is_final_passage = true;

-- ---------------------------------------------------------------------------
-- Per-legislator vote record.
-- voter_name_raw: surname as published by OpenStates ('G. Pierce', 'Cohn').
-- candidate_id: matched against the NC roster in candidates; null = unmatched.
-- match_method: 'surname' | 'surname+initial' | 'district' | 'manual' | 'unmatched'.
-- option: 'yes' | 'no' | 'absent' | 'abstain' | 'not voting' | 'excused'.
-- PK on (vote_event_id, voter_name_raw) — idempotent across reruns.
-- ---------------------------------------------------------------------------
create table if not exists public.nc_leg_vote_records (
  vote_event_id    text not null references public.nc_leg_vote_events(vote_event_id),
  voter_name_raw   text not null,
  candidate_id     text,                    -- null if unmatched; report via unmatched-voter report
  match_method     text,
  option           text,
  primary key (vote_event_id, voter_name_raw)
);

create index if not exists idx_nc_leg_vote_records_candidate_id
  on public.nc_leg_vote_records (candidate_id)
  where candidate_id is not null;

-- ---------------------------------------------------------------------------
-- Sync run log (internal — no public read policy).
-- ---------------------------------------------------------------------------
create table if not exists public.nc_leg_sync_runs (
  id                      bigint generated always as identity primary key,
  started_at              timestamptz not null default now(),
  finished_at             timestamptz,
  status                  text not null default 'running',  -- running | success | error
  mode                    text,                              -- discover | drain | full
  session                 text,
  pages_fetched           int default 0,
  bills_upserted          int default 0,
  vote_events_upserted    int default 0,
  vote_records_upserted   int default 0,
  unmatched_count         int default 0,
  error                   text
);

-- ---------------------------------------------------------------------------
-- RLS: bills / vote_events / vote_records are public reference data (read-only
-- to clients; service_role writes, bypasses RLS).
-- nc_leg_sync_runs is internal only — no public policy.
-- ---------------------------------------------------------------------------
alter table public.nc_leg_bills          enable row level security;
alter table public.nc_leg_vote_events    enable row level security;
alter table public.nc_leg_vote_records   enable row level security;
alter table public.nc_leg_sync_runs      enable row level security;

drop policy if exists nc_leg_bills_read       on public.nc_leg_bills;
drop policy if exists nc_leg_vote_events_read on public.nc_leg_vote_events;
drop policy if exists nc_leg_vote_records_read on public.nc_leg_vote_records;

create policy nc_leg_bills_read
  on public.nc_leg_bills for select using (true);

create policy nc_leg_vote_events_read
  on public.nc_leg_vote_events for select using (true);

create policy nc_leg_vote_records_read
  on public.nc_leg_vote_records for select using (true);
