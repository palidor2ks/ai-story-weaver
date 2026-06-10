-- TEMPORARY, SELF-QUIESCING: walk the full 118th-Congress bill corpus, chained
-- behind the 119th walk (20260610181500). Maintainer-approved 2026-06-10 —
-- "queue 118 to start automatically when 119 completes."
--
-- Coverage before this: we held ~7.2k of the 118th's ~16k bills; the missing
-- mass is never-advanced bills, which still carry sponsor/cosponsor signal for
-- members' records. Same cursor pattern as 119: one page per minute via
-- fetch-all-bills, upserting, resume cursor in bill_ingestion_status(118).
--
-- Chaining: fires only AFTER bill_ingestion_status says 119 is complete, and
-- quiesces to a no-op once 118 is complete. Cleanup once both are done:
--   select cron.unschedule('bills-catchup-119');
--   select cron.unschedule('bills-catchup-118');

-- Guard against any FILTERED prior walk (Codex review, PR #349, both rounds):
-- the admin UI calls fetch-all-bills with excludeIntroduced=true, which walks
-- the cursor while inserting only the non-introduced subset — exactly the
-- ~7.2k-of-~16k state this migration repairs. That filtered state can be left
-- either 'complete' (guard would quiesce on it) or 'in_progress' mid-walk
-- (cron would RESUME from the filtered prefix's offset, permanently skipping
-- its introduced-only bills). Both are identifiable by total_filtered > 0 —
-- rewind them to offset 0 regardless of status. A genuinely full walk has
-- total_filtered = 0 and is left alone; re-walking is idempotent (upserts).
-- (No-op on prod today: bill_ingestion_status had no 118 row when this shipped.)
update public.bill_ingestion_status
   set status = 'in_progress', last_offset = 0,
       total_fetched = 0, total_inserted = 0, total_filtered = 0,
       completed_at = null, updated_at = now()
 where congress = 118
   and coalesce(total_filtered, 0) > 0;

do $$ begin perform cron.unschedule('bills-catchup-118'); exception when others then null; end $$;
do $$ begin
  perform cron.schedule('bills-catchup-118', '* * * * *', $cron$
    -- Self-correct EVERY run, not just at migration time (Codex round 3): an
    -- admin can still click the dashboard's filtered ingest (excludeIntroduced)
    -- while this chain is waiting, re-poisoning the cursor. Statements run
    -- sequentially in one session, so the post below sees the reset values.
    update public.bill_ingestion_status
       set status = 'in_progress', last_offset = 0,
           total_fetched = 0, total_inserted = 0, total_filtered = 0,
           completed_at = null, updated_at = now()
     where congress = 118
       and coalesce(total_filtered, 0) > 0;
    select net.http_post(
      url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/fetch-all-bills',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
        'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bill_sync_secret')
      ),
      body := jsonb_build_object(
        'congress', 118,
        'offset', coalesce((select last_offset from public.bill_ingestion_status where congress = 118), 0),
        'limit', 250
      ),
      timeout_milliseconds := 120000
    )
    where exists (
      -- Filtered completions are NOT completions (Codex round 4): only chain
      -- once 119 finished an UNFILTERED walk.
      select 1 from public.bill_ingestion_status
      where congress = 119 and status = 'complete' and coalesce(total_filtered, 0) = 0
    )
    and not exists (
      select 1 from public.bill_ingestion_status
      where congress = 118 and status = 'complete'
    );
  $cron$);
exception when others then
  raise notice 'bills-catchup-118 cron not scheduled on this environment: %', sqlerrm;
end $$;

-- Harden the 119 job the same way (it shipped in 20260610181500 with a bare
-- status='complete' quiesce guard): a filtered admin walk of 119 marking
-- 'complete' would otherwise stop the unfiltered catch-up early AND open the
-- 118 chain. Reschedule it with the same self-reset + the same rule.
do $$ begin perform cron.unschedule('bills-catchup-119'); exception when others then null; end $$;
do $$ begin
  perform cron.schedule('bills-catchup-119', '* * * * *', $cron$
    update public.bill_ingestion_status
       set status = 'in_progress', last_offset = 0,
           total_fetched = 0, total_inserted = 0, total_filtered = 0,
           completed_at = null, updated_at = now()
     where congress = 119
       and coalesce(total_filtered, 0) > 0;
    select net.http_post(
      url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/fetch-all-bills',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
        'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bill_sync_secret')
      ),
      body := jsonb_build_object(
        'congress', 119,
        'offset', coalesce((select last_offset from public.bill_ingestion_status where congress = 119), 0),
        'limit', 250
      ),
      timeout_milliseconds := 120000
    )
    where not exists (
      select 1 from public.bill_ingestion_status
      where congress = 119 and status = 'complete'
    );
  $cron$);
exception when others then
  raise notice 'bills-catchup-119 cron not (re)scheduled on this environment: %', sqlerrm;
end $$;
