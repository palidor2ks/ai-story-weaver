-- Cron-invoked edge functions authenticate by comparing the caller's
-- `x-cron-secret` header against the `cron_secret` value in Supabase Vault.
-- The shared helper read it via PostgREST (`.schema('vault')...`), but the
-- `vault` schema is NOT exposed to PostgREST, so that read returned null and
-- every cron-authenticated function (daily stat-card picker, auto-post-due,
-- FEC drains, research queue, etc.) silently 401'd.
--
-- Expose the secret through a SECURITY DEFINER RPC in the public schema, which
-- PostgREST can reach and which can read the vault internally. Execution is
-- restricted to service_role (which edge functions use); end-user roles cannot
-- call it, so the secret is not exposed to the client.
create or replace function public.get_cron_secret()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'cron_secret'
  limit 1
$$;

revoke all on function public.get_cron_secret() from public;
revoke all on function public.get_cron_secret() from anon, authenticated;
grant execute on function public.get_cron_secret() to service_role;
