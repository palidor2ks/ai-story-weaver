-- CRON GATE: schedules for the per-answer source auditor (functions defined in
-- 20260620230000_answer_source_audit.sql; AI-check edge function audit-answer-sources). Kept in a
-- separate migration so apply-missing-migrations.sh pauses here under --include-crons (guardrail #2:
-- don't enable cron migrations without review). Registering these schedules is safe even before the
-- kill-switch is on — every stage no-ops while admin_stats_cache 'answer_audit_enabled' is
-- {"enabled": false} — but the schedule itself is the thing the cron gate exists to review, so it
-- lives here.
--
-- THREE-STAGE CADENCE (detect → AI-verify → targeted-fix), offset from the existing answer-pipeline
-- and score-sweeper crons (drain :00/:30, requeue :20, score detector :10/:40, score fixer :25/:55):
--   prefilter  (answer_audit_detect)        :05,:35
--   AI check   (audit-answer-sources, pg_net) :15,:45
--   fixer      (answer_audit_fix)           :50
-- The AI check runs between detect and fix so each pending row gets a verdict before the fixer drains
-- the 'contradicts' set. The AI-check call uses pg_net with the same header pattern as the fixer's
-- generate-legislator-answers call (publishable key for apikey/Authorization, vault cron_secret).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$ BEGIN PERFORM cron.unschedule('answer-audit-detect'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('answer-audit-aicheck'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('answer-audit-fix');     EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('answer-audit-detect', '5,35 * * * *',
  $cron$ SELECT public.answer_audit_detect(); $cron$);

SELECT cron.schedule('answer-audit-aicheck', '15,45 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/audit-answer-sources',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_publishable_key'),
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_publishable_key'),
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
$cron$);

SELECT cron.schedule('answer-audit-fix', '50 * * * *',
  $cron$ SELECT public.answer_audit_fix(); $cron$);
