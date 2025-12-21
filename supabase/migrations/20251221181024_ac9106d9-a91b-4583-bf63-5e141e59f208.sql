-- Enable required extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule job to run every 6 hours to batch process candidate answers
SELECT cron.schedule(
  'batch-populate-answers-job',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/batch-populate-answers',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybm56aW5qcmN5aWdhemVjY3RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyOTAwMjgsImV4cCI6MjA4MTg2NjAyOH0.hijd7BMAA5g-C4vH5OHkPbpsIu657ySbv84EWWdiaSI", "Content-Type": "application/json"}'::jsonb,
    body := '{"batchSize": 10}'::jsonb
  ) AS request_id;
  $$
);