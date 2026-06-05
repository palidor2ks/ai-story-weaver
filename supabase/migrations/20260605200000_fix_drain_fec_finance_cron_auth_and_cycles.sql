-- Corrective reschedule of the drain-fec-finance cron so the repo matches the
-- working production configuration, and so cycle coverage is future-proof.
--
-- The previous migration (20260605190000_drain_fec_finance_multicycle_cron) would break
-- the cron if applied verbatim:
--
--   1) It omitted the `x-cron-secret` header. The drain-fec-finance function gates every
--      request through requireCronAuth (_shared/cron-auth.ts), which accepts ONLY a valid
--      `x-cron-secret` (matching Vault's `cron_secret`) or an `Authorization: Bearer
--      <service-role>` token. The cron sends an anon bearer, so without `x-cron-secret`
--      every invocation 401s and the drain silently stops.
--
-- This reschedules with the header set the deployed cron actually uses — Vault-sourced
-- Authorization/apikey plus `x-cron-secret` from `cron_secret`.
--
-- Cycle coverage: the body passes NO explicit cycle, so the function auto-discovers which
-- cycles to process. resolveCycles() reads distinct cycles from finance_reconciliation —
-- the table the drain maintains — so new cycles (e.g. 2028) are covered automatically as
-- soon as they have reconciliation data, while empty historical cycles (which only exist
-- in candidates' FEC membership history, back to the 1970s) are never touched. No need to
-- edit this migration when a new cycle opens.
--
-- Idempotent (unschedule then schedule); same every-10-min schedule.

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
    body := '{"resumeBatch":3,"totalsBatch":12,"stalenessDays":7}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);
