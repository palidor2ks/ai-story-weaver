-- CRON GATE: schedules for the score-sanity sweeper (functions defined in
-- 20260620220000_score_sanity_sweeper.sql). Kept in a separate migration so
-- apply-missing-migrations.sh pauses here under --include-crons (guardrail #2: don't enable cron
-- migrations without review). Registering these schedules is safe even before the kill-switch is
-- on — both functions no-op while admin_stats_cache 'score_sweeper_enabled' is {"enabled": false} —
-- but the schedule itself is the thing the cron gate exists to review, so it lives here.
--
-- Cadence is offset from the existing answer-pipeline crons (drain :00/:30, requeue :20):
--   detector :10,:40   fixer :25,:55

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$ BEGIN PERFORM cron.unschedule('score-sanity-detector'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('score-sanity-fixer');    EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('score-sanity-detector', '10,40 * * * *', $cron$ SELECT public.score_sanity_detect(); $cron$);
SELECT cron.schedule('score-sanity-fixer',    '25,55 * * * *', $cron$ SELECT public.score_sanity_fix();    $cron$);
