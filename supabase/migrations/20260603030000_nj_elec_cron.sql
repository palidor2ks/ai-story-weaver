-- Scheduled NJ ELEC ingestion.
--   nj-elec-drain    : every 3 min, process the next batch of entities whose
--                      contributions are unsynced or stale (resumable backfill;
--                      steady-state weekly refresh governed by the function's
--                      stale_days default).
--   nj-elec-discover : weekly, refresh candidate/committee lists so new filers
--                      are picked up.
-- The function-invocation credential is read from Vault at execution time
-- (secret 'nj_elec_cron_anon_key'), so no credential is committed to source.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin perform cron.unschedule('nj-elec-drain');    exception when others then null; end $$;
do $$ begin perform cron.unschedule('nj-elec-discover'); exception when others then null; end $$;

select cron.schedule('nj-elec-drain', '*/3 * * * *', $cron$
  select net.http_post(
    url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/fetch-nj-elec-finance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key')
    ),
    body := '{"mode":"drain","batch":20}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);

select cron.schedule('nj-elec-discover', '0 6 * * 1', $cron$
  select net.http_post(
    url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/fetch-nj-elec-finance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key')
    ),
    body := '{"mode":"discover","office_codes":["1","2"],"election_years":[2025,2023,2021]}'::jsonb,
    timeout_milliseconds := 150000
  );
$cron$);
