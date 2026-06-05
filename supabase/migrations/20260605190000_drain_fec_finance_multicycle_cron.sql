-- Reschedule the FEC finance backstop to cover ALL active cycles and keep
-- already-populated totals fresh.
--
-- Previously the drain-fec-finance cron passed a hard-coded {"cycle":"2026"},
-- so:
--   * the prior cycle (2024) was never auto-refreshed — its finance_reconciliation
--     rows went stale and gaps (local data but $0 FEC total) were never filled; and
--   * even for 2026, the drain only filled gaps, so a candidate's FEC/Local totals
--     stopped updating once populated until an admin manually re-ran totals.
--
-- The drain-fec-finance function now (a) auto-discovers every cycle with finance
-- data when no cycle is passed (via get_committee_cycles, so future cycles are
-- picked up automatically) and (b) treats rows whose reconciliation is older than
-- `stalenessDays` as due for a refresh, not just missing/$0 gaps. We therefore drop
-- the hard-coded cycle from the cron body and pass tuning params only.
--
-- Schedule and auth headers are unchanged from the original cron (every 10 min;
-- credential read from Vault at runtime — no secret committed).

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
    body := '{"resumeBatch":3,"totalsBatch":12,"stalenessDays":7}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);
