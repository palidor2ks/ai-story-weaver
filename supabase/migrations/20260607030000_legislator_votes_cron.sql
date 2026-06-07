-- Scheduled legislator voting-record sync (floor roll-call votes + member
-- sponsor/cosponsor activity), draining a small batch of the stalest federal
-- legislators on each tick via the sync-legislator-votes orchestrator.
--
-- ⚠️ CRON MIGRATION — review before auto-apply (recurring external Congress.gov
-- API calls). See docs/dev-migration-resync.md; apply with --include-crons.
--
-- Auth model (mirrors check_nj_sync_secret / photo-enrich cron):
--   * A shared secret lives only in Vault ('vote_sync_secret'), generated at
--     apply-time and never committed.
--   * The orchestrator and fetch-floor-votes validate it via the service-role-
--     only RPC check_vote_sync_secret(), so no admin JWT is needed under cron.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1) Seed the cron secret in Vault (generated here; never committed). Idempotent.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'vote_sync_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'vote_sync_secret'
    );
  end if;
end $$;

-- 2) Service-role-only validator RPC.
create or replace function public.check_vote_sync_secret(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'vote_sync_secret' and decrypted_secret = p_token
  );
$function$;

revoke all on function public.check_vote_sync_secret(text) from public;
grant execute on function public.check_vote_sync_secret(text) to service_role;

-- 3) Unschedule any prior version (idempotent).
do $$ begin perform cron.unschedule('sync-legislator-votes'); exception when others then null; end $$;

-- 4) Schedule: every 15 minutes, drain 20 of the stalest legislators
--    (~80/hour, full ~540-member pass in ~7h). Tune `batch`/schedule freely.
select cron.schedule('sync-legislator-votes', '*/15 * * * *', $cron$
  select net.http_post(
    url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/sync-legislator-votes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_publishable_key'),
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'vote_sync_secret')
    ),
    body := '{"batch":20,"scope":"both"}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);
