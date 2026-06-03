-- Fix the congress-donor cron 401s.
-- schedule-congress-donor-sync authorizes a request when the apikey/bearer matches
-- its resolved anon key — which is the project's *publishable* key
-- (sb_publishable_...). The crons were created with the legacy JWT anon key (eyJ...)
-- plus a now-expired admin bearer, so they fell through to the admin check and 401'd.
-- Re-point them at the publishable key (read from Vault; no key committed to source)
-- and drop the stale bearer.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin perform cron.unschedule('congress-donor-backfill-10m'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('congress-donor-refresh-daily'); exception when others then null; end $$;

select cron.schedule('congress-donor-backfill-10m', '*/10 * * * *', $cron$
  select net.http_post(
    url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/schedule-congress-donor-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_publishable_key')
    ),
    body := '{"scope":"congress_visible","mode":"backfill","limit":1,"cycle":"2024"}'::jsonb
  );
$cron$);

select cron.schedule('congress-donor-refresh-daily', '0 7 * * *', $cron$
  select net.http_post(
    url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/schedule-congress-donor-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_publishable_key')
    ),
    body := '{"scope":"congress_visible","mode":"refresh","limit":1,"cycle":"2024"}'::jsonb
  );
$cron$);
