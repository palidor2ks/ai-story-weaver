-- Retire the state finance and legislative vote pg_cron jobs now handled by
-- the Railway graphile-worker service (PR #523).
--
-- Apply ONLY after confirming Railway worker is firing these tasks cleanly.
-- Jobs are idempotent so double-firing during transition is harmless.

DO $$ BEGIN PERFORM cron.unschedule('nj-elec-drain');              EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('nj-elec-discover');           EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('fl-drain');                   EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('fl-discover');                EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('ny-drain');                   EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('ny-discover');                EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('tx-cf-drain');                EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('tx-cf-discover');             EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('congress-donor-backfill-10m'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('congress-donor-refresh-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('sync-legislator-votes');      EXCEPTION WHEN OTHERS THEN NULL; END $$;
