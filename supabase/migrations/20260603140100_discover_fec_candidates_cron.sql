-- Schedule nationwide FEC candidate discovery every 6 hours (at :05, staggered off the hour).
-- Idempotent: existing candidates are no-ops; the function advances a page cursor in
-- candidate_ingest_status and wraps to re-sweep, catching new Statement-of-Candidacy filers.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('discover-fec-candidates');
EXCEPTION WHEN OTHERS THEN
  -- ignore if it doesn't exist yet
  NULL;
END $$;

SELECT cron.schedule(
  'discover-fec-candidates',
  '5 */6 * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/discover-fec-candidates',
      headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybm56aW5qcmN5aWdhemVjY3RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyOTAwMjgsImV4cCI6MjA4MTg2NjAyOH0.hijd7BMAA5g-C4vH5OHkPbpsIu657ySbv84EWWdiaSI"}'::jsonb,
      body := '{"maxPages":8}'::jsonb
    ) AS request_id;
  $cron$
);
