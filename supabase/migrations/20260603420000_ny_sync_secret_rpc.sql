-- check_ny_sync_secret(p_token): true iff p_token matches the 'ny_sync_secret'
-- Vault secret. Gates the fetch-ny-finance edge function without a function env
-- var (the secret lives only in Vault, compared via this SECURITY DEFINER RPC
-- called with the service-role key). Mirrors check_nj_/check_fl_sync_secret.
-- The 'ny_sync_secret' Vault secret is created out of band (vault.create_secret).

create or replace function public.check_ny_sync_secret(p_token text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'ny_sync_secret' and decrypted_secret = p_token
  );
$function$;

grant execute on function public.check_ny_sync_secret(text) to anon, authenticated, service_role;
