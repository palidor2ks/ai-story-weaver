-- Revive the nightly bill sync (dead since 2026-01-13).
--
-- Why: nightly-bill-sync only accepted an admin user JWT, so no scheduler could
-- call it — the bills corpus silently froze for ~5 months (caught by the data-
-- accuracy scoreboard, migration 20260610170000; maintainer approved the revival
-- 2026-06-10 per guardrail #2). This gives the function the same Vault shared-
-- secret path the state-finance functions use (check_nj_sync_secret pattern) and
-- schedules it nightly via pg_net.
--
-- The secret VALUE is created out-of-band in Vault (name 'bill_sync_secret'),
-- never committed to source. The cron reads it from Vault at runtime, so this
-- file contains no literals.

-- Validates a caller-supplied token against the Vault-stored shared secret.
-- SECURITY DEFINER so it can read Vault; EXECUTE restricted to service_role
-- (the edge function checks the token via its service-role client), so
-- anon/authenticated callers can neither read nor brute-force the secret.
create or replace function public.check_bill_sync_secret(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'bill_sync_secret' and decrypted_secret = p_token
  );
$$;

revoke all on function public.check_bill_sync_secret(text) from public;
grant execute on function public.check_bill_sync_secret(text) to service_role;

-- Nightly at 03:10 UTC (offset from the 03:00 crowd). Defaults in the function
-- body: congress 119, fromDateTime = last 24h, limit 250/page. Guarded like
-- 20260610170000 so environments without pg_cron/pg_net/Vault still migrate.
do $$ begin perform cron.unschedule('nightly-bill-sync'); exception when others then null; end $$;
do $$ begin
  perform cron.schedule('nightly-bill-sync', '10 3 * * *', $cron$
    select net.http_post(
      url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/nightly-bill-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
        'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bill_sync_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 150000
    );
  $cron$);
exception when others then
  raise notice 'nightly-bill-sync cron not scheduled on this environment: %', sqlerrm;
end $$;