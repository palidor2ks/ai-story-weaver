-- Track pagination cursors per committee/cycle to enable resumable syncs
alter table public.candidate_committees
  add column if not exists last_index text,
  add column if not exists last_contribution_date text,
  add column if not exists last_cycle text,
  add column if not exists last_sync_started_at timestamptz,
  add column if not exists last_sync_completed_at timestamptz;

comment on column public.candidate_committees.last_index is 'FEC pagination cursor (last_index) for schedule_a';
comment on column public.candidate_committees.last_contribution_date is 'FEC pagination cursor (last_contribution_receipt_date) for schedule_a';
comment on column public.candidate_committees.last_cycle is 'Cycle the cursor applies to';
comment on column public.candidate_committees.last_sync_started_at is 'Timestamp of latest sync attempt start';
comment on column public.candidate_committees.last_sync_completed_at is 'Timestamp when sync finished for this committee';
