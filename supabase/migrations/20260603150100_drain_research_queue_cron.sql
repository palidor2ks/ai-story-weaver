-- Schedule the Phase 2 enrichment drainer every 30 minutes. Bounded by batchSize so AI
-- cost stays predictable (batchSize × runs/day). Idempotent: candidates leave the queue
-- when get-candidate-answers sets answers_source='ai_generated'.
-- NOTE: the apikey below is the project's PUBLIC anon key (role:anon, already present in
-- other cron migrations and the frontend bundle) — not a privileged secret.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('drain-research-queue');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'drain-research-queue',
  '*/30 * * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/drain-research-queue',
      headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybm56aW5qcmN5aWdhemVjY3RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyOTAwMjgsImV4cCI6MjA4MTg2NjAyOH0.hijd7BMAA5g-C4vH5OHkPbpsIu657ySbv84EWWdiaSI"}'::jsonb,
      body := '{"batchSize":5}'::jsonb
    ) AS request_id;
  $cron$
);
