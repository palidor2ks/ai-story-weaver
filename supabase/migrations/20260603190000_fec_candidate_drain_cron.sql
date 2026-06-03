-- Recurring committee-link + donor-sync drain for FEC candidates.
-- Closes the gap where discover-fec-candidates creates candidate rows (with an FEC
-- candidate ID) but nothing links their committee or syncs finance promptly. The
-- fec-candidate-drain function processes a batch of never-synced candidates per run
-- (links committee via fetch-fec-committees, syncs donors via fetch-fec-donors), so
-- this both clears the existing backlog and keeps up with future discoveries.
-- Credential is read from Vault at runtime (no secret committed).

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin perform cron.unschedule('fec-candidate-drain'); exception when others then null; end $$;

select cron.schedule('fec-candidate-drain', '*/3 * * * *', $cron$
  select net.http_post(
    url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/fec-candidate-drain',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key')
    ),
    body := '{"batch":6,"cycle":"2026"}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);
