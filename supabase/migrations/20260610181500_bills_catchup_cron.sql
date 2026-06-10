-- TEMPORARY, SELF-QUIESCING: walk the entire 119th-Congress bill corpus to close
-- the 148-day gap left by the dead nightly sync (see 20260610180000).
--
-- Why this shape: nightly-bill-sync restarts at offset 0 every run and sleeps
-- 50ms/bill, so a multi-month window can never finish inside one edge wall-clock
-- (~150s) — repeated kicks asymptote (run 1 inserted 1,191 new bills, run 2 only
-- 387). fetch-all-bills processes ONE page per call and persists a resume cursor
-- (bill_ingestion_status.last_offset), so a every-minute cron converges linearly:
-- ~250 bills/min, full corpus in roughly an hour, upserting (refreshes stale
-- latest_action on existing bills too).
--
-- Self-quiescing: the WHERE clause makes the job a no-op SELECT once
-- bill_ingestion_status says 'complete' (and on 'failed' it retries the same
-- page, since last_offset only advances on success). Safe to leave scheduled;
-- unschedule it as cleanup once complete:
--   select cron.unschedule('bills-catchup-119');

do $$ begin perform cron.unschedule('bills-catchup-119'); exception when others then null; end $$;
do $$ begin
  perform cron.schedule('bills-catchup-119', '* * * * *', $cron$
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
  raise notice 'bills-catchup-119 cron not scheduled on this environment: %', sqlerrm;
end $$;
