-- Scheduled FL Division of Elections ingestion.
--   fl-drain    : every 3 min, process the next batch of (election,office,district)
--                 units whose contributions are unsynced or stale (resumable
--                 backfill; steady-state refresh governed by the function's
--                 stale_days default).
--   fl-discover : weekly, (re)enumerate the work units so new election cycles and
--                 districts are picked up.
-- Credentials are read from Vault at execution time — none committed to source:
--   * bearer/apikey  : 'nj_elec_cron_anon_key' (this project's publishable key;
--                      shared across the state-finance crons on this project).
--   * x-sync-secret  : 'fl_sync_secret' (gates fetch-fl-finance via check_fl_sync_secret).

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin perform cron.unschedule('fl-drain');    exception when others then null; end $$;
do $$ begin perform cron.unschedule('fl-discover'); exception when others then null; end $$;

select cron.schedule('fl-drain', '*/3 * * * *', $cron$
  select net.http_post(
    url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/fetch-fl-finance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fl_sync_secret')
    ),
    body := '{"mode":"drain","batch":10}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);

select cron.schedule('fl-discover', '30 6 * * 1', $cron$
  select net.http_post(
    url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/fetch-fl-finance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fl_sync_secret')
    ),
    body := '{"mode":"discover"}'::jsonb,
    timeout_milliseconds := 150000
  );
$cron$);
