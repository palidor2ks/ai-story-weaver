-- Scheduled Independent Expenditure (FEC Schedule E) ingestion.
--   ie-import-daily : once a day, pull the most-recent Schedule E independent
--                     expenditures for the current cycle straight from the FEC
--                     API and upsert into independent_expenditures. Keeps the
--                     Top Outside Spenders view current with no manual CSV step.
-- The function paginates newest-first and upserts by (transaction id, spending
-- committee), so a daily run is self-correcting — rows seen again update in
-- place rather than duplicating.
-- Credentials are read from Vault at execution time (none committed to source):
--   * bearer/apikey : 'nj_elec_cron_anon_key' (this project's publishable key,
--                     shared across the data-ingestion crons on this project).
--   * x-sync-secret : 'ie_sync_secret' (gates import-independent-expenditures
--                     via check_ie_sync_secret).

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin perform cron.unschedule('ie-import-daily'); exception when others then null; end $$;

select cron.schedule('ie-import-daily', '0 9 * * *', $cron$
  select net.http_post(
    url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/import-independent-expenditures',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ie_sync_secret')
    ),
    body := '{"cycle":"2026","min_amount":10000,"max_pages":10}'::jsonb,
    timeout_milliseconds := 150000
  );
$cron$);
