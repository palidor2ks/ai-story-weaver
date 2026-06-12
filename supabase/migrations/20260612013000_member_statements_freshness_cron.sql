-- Freshness cron for the member-statements evidence index.
--
-- Why: the 541-member coverage run (2026-06-11, HANDOFF 6th arc) filled
-- public.member_statements, but the corpus goes stale without a scheduled re-walk.
-- Owner approved this cron 2026-06-12 (guardrail #2 review): every 6 hours, kick
-- fetch-member-statements with a bounded self-chain — limit 4 members/invocation,
-- max_chain 20 (≤ ~84 members/run; claims pick the stalest members first via
-- claim_statement_sync_members, so the full corpus refreshes on a ~1-2 day cycle).
-- New releases upsert in; duplicates are ignored on (candidate_id, url); stuck
-- claims expire after an hour; chains stop when claims come back short.
--
-- No literals: the apikey and cron secret are read from Vault at runtime
-- (nj_elec_cron_anon_key / cron_secret — same rows every other cron uses).
-- Guarded like 20260610180000 so environments without pg_cron/pg_net/Vault
-- (e.g. bare preview replays) still migrate cleanly.

do $$ begin perform cron.unschedule('fetch-member-statements-6h'); exception when others then null; end $$;
do $$ begin
  perform cron.schedule('fetch-member-statements-6h', '20 */6 * * *', $cron$
    select net.http_post(
      url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/fetch-member-statements',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := '{"limit":4,"max_chain":20}'::jsonb,
      timeout_milliseconds := 15000
    );
  $cron$);
exception when others then null; end $$;
