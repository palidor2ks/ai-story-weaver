-- Shared secret for headless data imports (FEC receipts / Schedule E / bills).
--
-- Lets the Drive importer drive the admin-gated import edge functions with a
-- Vault-backed `x-sync-secret` header instead of a short-lived admin JWT —
-- same pattern as check_nj_sync_secret / check_vote_sync_secret. The functions
-- keep their existing admin-JWT path; the secret is an additional way in.

-- 1) Seed the secret in Vault (generated here; never committed). Idempotent.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'import_sync_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'import_sync_secret'
    );
  end if;
end $$;

-- 2) Service-role-only validator RPC.
create or replace function public.check_import_sync_secret(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'import_sync_secret' and decrypted_secret = p_token
  );
$function$;

revoke all on function public.check_import_sync_secret(text) from public;
grant execute on function public.check_import_sync_secret(text) to service_role;
