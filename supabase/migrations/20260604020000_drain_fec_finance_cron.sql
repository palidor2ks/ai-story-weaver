-- Recurring FEC finance backstop.
--
-- Closes two gaps that left candidates with imported local data showing a $0 FEC
-- total indefinitely:
--   1) FEC summary totals are only fetched when a receipt sync runs to completion
--      (fetch-fec-donors fetches /committee/totals only when committeeHasMore=false),
--      and interrupted syncs were never resumed automatically.
--   2) Nothing was scheduled to refresh FEC totals independently — despite its name,
--      `nightly-finance-reconciliation` had no cron and only ran on manual admin action.
--
-- The drain-fec-finance function (a) resumes partial P/A syncs via fetch-fec-donors
-- and (b) refreshes missing/stale totals via refresh-fec-totals (both honor the
-- service-role key). It is time-budgeted, idempotent and resumable, so it both clears
-- the existing backlog and keeps up going forward.
--
-- Credential is read from Vault at runtime (no secret committed), matching the other
-- finance drains (nj-elec/fl/ny/fec-candidate).

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin perform cron.unschedule('drain-fec-finance'); exception when others then null; end $$;

select cron.schedule('drain-fec-finance', '*/10 * * * *', $cron$
  select net.http_post(
    url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/drain-fec-finance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key')
    ),
    body := '{"cycle":"2026","resumeBatch":3,"totalsBatch":12}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);
