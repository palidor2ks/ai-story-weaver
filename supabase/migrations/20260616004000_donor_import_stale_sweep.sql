-- Stale-sweep for donor import sessions.
--
-- Donor imports are browser-driven: the terminal status ('completed' /
-- 'completed_with_errors') is only written by the browser at the end of the
-- batch loop. If the tab is closed, refreshed, or the network drops mid-import,
-- the session row is orphaned at status='running' forever.
--
-- This migration adds:
--   1. A sweep function that flips orphaned 'running' sessions to 'stalled' once
--      they've had no progress for 30+ minutes. 'stalled' is a genuine DB-persisted
--      terminal status (previously it was only a computed UI label).
--   2. A pg_cron job that runs the sweep every 30 minutes so the admin history
--      panel stays honest without any browser involvement.
--
-- The 30-minute threshold is safe: each 500-row batch finishes in seconds even on
-- a slow connection. 10 minutes of silence already means the browser loop is dead
-- (per STALE_IMPORT_MS in donorImportStatus.ts); 30 minutes gives plenty of grace
-- before the DB write happens.

CREATE OR REPLACE FUNCTION public.sweep_stalled_import_sessions()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.donor_import_sessions
  SET status = 'stalled'
  WHERE status = 'running'
    AND COALESCE(last_progress_at, started_at) < now() - interval '30 minutes';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Allow admins to call the sweep manually from the dashboard if needed.
GRANT EXECUTE ON FUNCTION public.sweep_stalled_import_sessions() TO authenticated;

-- Schedule the sweep every 30 minutes. Unschedule first so re-applying is safe.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$ BEGIN PERFORM cron.unschedule('sweep-stalled-import-sessions'); EXCEPTION WHEN others THEN NULL; END $$;

SELECT cron.schedule(
  'sweep-stalled-import-sessions',
  '*/30 * * * *',
  $cron$ SELECT public.sweep_stalled_import_sessions(); $cron$
);
