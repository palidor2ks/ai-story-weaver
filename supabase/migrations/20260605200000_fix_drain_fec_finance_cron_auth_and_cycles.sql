-- Corrective reschedule of the drain-fec-finance cron so the repo matches the
-- working production configuration.
--
-- The previous migration (20260605190000_drain_fec_finance_multicycle_cron) had two
-- problems that would break the cron if applied verbatim to a project whose live cron
-- was hand-configured with the real auth headers:
--
--   1) It omitted the `x-cron-secret` header. The drain-fec-finance function gates every
--      request through requireCronAuth (_shared/cron-auth.ts), which accepts ONLY a valid
--      `x-cron-secret` (matching Vault's `cron_secret`) or an `Authorization: Bearer
--      <service-role>` token. The cron sends an anon bearer, so without `x-cron-secret`
--      every invocation 401s and the drain silently stops.
--
--   2) It passed no cycle, relying on the function's auto-discovery. That discovery uses
--      get_committee_cycles() (distinct cycles in committee_finance_rollups), which on this
--      project returns ~26 cycles back to 1976 — but only 2026 and 2024 have
--      finance_reconciliation data. Iterating all of them every 10 minutes is wasteful.
--
-- This reschedules with the header set the deployed cron actually uses — Vault-sourced
-- Authorization/apikey plus `x-cron-secret` from `cron_secret` — and pins the two active
-- cycles. The function already honors an explicit `cycles` param. Idempotent (unschedule
-- then schedule); same every-10-min schedule.
--
-- When a new active cycle opens (e.g. 2028), add it to the `cycles` array here.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin perform cron.unschedule('drain-fec-finance'); exception when others then null; end $$;

select cron.schedule('drain-fec-finance', '*/10 * * * *', $cron$
  select net.http_post(
    url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/drain-fec-finance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"cycles":["2026","2024"],"resumeBatch":3,"totalsBatch":12,"stalenessDays":7}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);
