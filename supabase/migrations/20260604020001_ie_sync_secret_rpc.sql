-- check_ie_sync_secret(p_token): true iff p_token matches the 'ie_sync_secret'
-- Vault secret. Gates the import-independent-expenditures edge function for
-- cron / server callers without a function env var — the secret lives only in
-- Vault and is compared via this SECURITY DEFINER RPC (called with the
-- service-role key). Mirrors check_nj_/check_fl_/check_ny_sync_secret. The
-- 'ie_sync_secret' Vault secret is created out of band (vault.create_secret),
-- never committed to source.

create or replace function public.check_ie_sync_secret(p_token text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'ie_sync_secret' and decrypted_secret = p_token
  );
$function$;

grant execute on function public.check_ie_sync_secret(text) to anon, authenticated, service_role;
