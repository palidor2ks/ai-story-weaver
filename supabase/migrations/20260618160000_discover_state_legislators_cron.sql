-- Weekly OpenStates → candidates ingestion cron for NJ + NC state legislators.
--
-- Why: discover-state-legislators sweeps both states via the OpenStates v3 API and
-- onboards results through the shared resolveAndUpsertCandidate funnel. Rows land
-- with coverage_tier='tier_3' and answers_source='pending_research' — directory-first,
-- no AI scoring kicked. Fully idempotent: duplicate people deduplicate on the shared
-- openstates_${id} key convention.
--
-- Schedule: Monday 07:30 UTC, staggered from nj-elec (0 6 * * 1) and ny (0 7 * * 1).
-- Vault-based auth pattern copied from 20260612013000_member_statements_freshness_cron.sql.

do $$ begin perform cron.unschedule('discover-state-legislators-weekly'); exception when others then null; end $$;
do $$ begin
  perform cron.schedule('discover-state-legislators-weekly', '30 7 * * 1', $cron$
    select net.http_post(
      url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/discover-state-legislators',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 15000
    );
  $cron$);
exception when others then raise notice 'discover-state-legislators-weekly not scheduled: %', sqlerrm; end $$;
