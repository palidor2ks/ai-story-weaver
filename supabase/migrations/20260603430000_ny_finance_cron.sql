-- Scheduled NY (data.ny.gov / NYSBOE) ingestion.
--   ny-drain    : every 3 min, process the next batch of filers whose
--                 contributions are unsynced or stale (resumable backfill).
--   ny-discover : weekly, (re)enumerate state-legislative filers so new
--                 committees / cycles are picked up.
-- Credentials read from Vault at execution time (none committed to source):
--   * bearer/apikey : 'nj_elec_cron_anon_key' (this project's publishable key,
--                     shared across the state-finance crons on this project).
--   * x-sync-secret : 'ny_sync_secret' (gates fetch-ny-finance via check_ny_sync_secret).

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin perform cron.unschedule('ny-drain');    exception when others then null; end $$;
do $$ begin perform cron.unschedule('ny-discover'); exception when others then null; end $$;

select cron.schedule('ny-drain', '*/3 * * * *', $cron$
  select net.http_post(
    url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/fetch-ny-finance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ny_sync_secret')
    ),
    body := '{"mode":"drain","batch":15}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);

select cron.schedule('ny-discover', '0 7 * * 1', $cron$
  select net.http_post(
    url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/fetch-ny-finance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ny_sync_secret')
    ),
    body := '{"mode":"discover"}'::jsonb,
    timeout_milliseconds := 150000
  );
$cron$);
