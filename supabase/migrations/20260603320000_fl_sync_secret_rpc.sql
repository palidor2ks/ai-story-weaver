-- check_fl_sync_secret(p_token): true iff p_token matches the 'fl_sync_secret'
-- Vault secret. Lets the fetch-fl-finance edge function gate writes without a
-- function env var — the secret lives only in Vault and is compared via this
-- SECURITY DEFINER RPC (called with the service-role key). Mirrors
-- check_nj_sync_secret. The 'fl_sync_secret' Vault secret is created out of band
-- (vault.create_secret), never committed to source.

create or replace function public.check_fl_sync_secret(p_token text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'fl_sync_secret' and decrypted_secret = p_token
  );
$function$;

grant execute on function public.check_fl_sync_secret(text) to anon, authenticated, service_role;
