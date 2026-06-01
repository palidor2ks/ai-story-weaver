
-- 1. Table for run logs
CREATE TABLE IF NOT EXISTS public.donor_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  mode text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  processed int NOT NULL DEFAULT 0,
  success_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  remaining int,
  fec_ids_filled int NOT NULL DEFAULT 0,
  triggered_by text NOT NULL DEFAULT 'cron',
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text
);

GRANT SELECT ON public.donor_sync_runs TO authenticated;
GRANT ALL ON public.donor_sync_runs TO service_role;

ALTER TABLE public.donor_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view donor sync runs"
  ON public.donor_sync_runs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS donor_sync_runs_started_at_idx
  ON public.donor_sync_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS donor_sync_runs_scope_mode_idx
  ON public.donor_sync_runs (scope, mode, started_at DESC);

-- 2. Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 3. Schedule the two cron jobs (idempotent: unschedule first if exists)
DO $$
DECLARE
  v_url_base text := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/schedule-congress-donor-sync';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybm56aW5qcmN5aWdhemVjY3RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyOTAwMjgsImV4cCI6MjA4MTg2NjAyOH0.hijd7BMAA5g-C4vH5OHkPbpsIu657ySbv84EWWdiaSI';
BEGIN
  PERFORM cron.unschedule('congress-donor-backfill-10m')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'congress-donor-backfill-10m');
  PERFORM cron.unschedule('congress-donor-refresh-daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'congress-donor-refresh-daily');

  PERFORM cron.schedule(
    'congress-donor-backfill-10m',
    '*/10 * * * *',
    format(
      $job$
      select net.http_post(
        url := %L,
        headers := %L::jsonb,
        body := %L::jsonb
      );
      $job$,
      v_url_base,
      json_build_object('Content-Type','application/json','apikey', v_anon, 'Authorization', 'Bearer ' || v_anon)::text,
      json_build_object('scope','congress_visible','mode','backfill','limit',10,'cycle','2024')::text
    )
  );

  PERFORM cron.schedule(
    'congress-donor-refresh-daily',
    '0 7 * * *',
    format(
      $job$
      select net.http_post(
        url := %L,
        headers := %L::jsonb,
        body := %L::jsonb
      );
      $job$,
      v_url_base,
      json_build_object('Content-Type','application/json','apikey', v_anon, 'Authorization', 'Bearer ' || v_anon)::text,
      json_build_object('scope','congress_visible','mode','refresh','limit',25,'cycle','2024')::text
    )
  );
END $$;
