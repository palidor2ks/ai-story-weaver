-- Retire the 4 pg_cron jobs now handled by the Railway graphile-worker service.
--
-- These jobs were moved to workers/ (graphile-worker on Railway) in PR #520/#521.
-- The Railway worker calls the same edge functions via HTTP with the service-role
-- key and uses graphile-worker's ?jobKey= option to prevent pile-up.
--
-- Apply this migration ONLY after confirming the Railway worker has been running
-- cleanly (check Railway logs for task completion events).

DO $$ BEGIN PERFORM cron.unschedule('drain-fec-finance');    EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('fec-candidate-drain');  EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('drain-research-queue'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('nightly-bill-sync');    EXCEPTION WHEN OTHERS THEN NULL; END $$;
