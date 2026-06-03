-- Lock-down support for fetch-nj-elec-finance.
-- Validates a caller-supplied token against a Vault-stored shared secret
-- ('nj_sync_secret'). SECURITY DEFINER so it can read Vault; EXECUTE is restricted
-- to service_role (the edge function uses the service role), so anon/authenticated
-- callers can neither read nor brute-force the secret. The secret value itself is
-- created out-of-band in Vault (never committed to source).
create or replace function public.check_nj_sync_secret(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'nj_sync_secret' and decrypted_secret = p_token
  );
$$;

revoke all on function public.check_nj_sync_secret(text) from public;
grant execute on function public.check_nj_sync_secret(text) to service_role;
