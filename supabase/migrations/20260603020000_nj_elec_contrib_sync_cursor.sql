-- Resumable contribution-sync cursor for NJ ELEC ingestion.
-- The fetcher's "drain" mode processes entities whose contributions are unsynced
-- or stale (so a single scheduled invocation stays within edge-function limits and
-- the backfill drains incrementally across runs).

alter table public.nj_elec_entities
  add column if not exists contrib_synced_at timestamptz;

-- nulls first => unsynced entities are picked up before already-synced ones.
create index if not exists idx_nj_elec_entities_contrib_sync
  on public.nj_elec_entities (contrib_synced_at nulls first);
