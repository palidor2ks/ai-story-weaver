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

do $$ begin perform cron.unschedule('bills-catchup-118'); exception when others then null; end $$;
do $$ begin
  perform cron.schedule('bills-catchup-118', '* * * * *', $cron$
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
      select 1 from public.bill_ingestion_status
      where congress = 119 and status = 'complete'
    )
    and not exists (
      select 1 from public.bill_ingestion_status
      where congress = 118 and status = 'complete'
    );
  $cron$);
exception when others then
  raise notice 'bills-catchup-118 cron not scheduled on this environment: %', sqlerrm;
end $$;
