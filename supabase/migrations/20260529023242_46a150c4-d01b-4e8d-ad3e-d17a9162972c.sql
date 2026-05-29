
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove previous schedule of the same name if it exists
DO $$
BEGIN
  PERFORM cron.unschedule('pick-daily-stat-card-hourly');
EXCEPTION WHEN OTHERS THEN
  -- ignore if it doesn't exist
  NULL;
END $$;

SELECT cron.schedule(
  'pick-daily-stat-card-hourly',
  '0 * * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/pick-daily-stat-card',
      headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybm56aW5qcmN5aWdhemVjY3RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyOTAwMjgsImV4cCI6MjA4MTg2NjAyOH0.hijd7BMAA5g-C4vH5OHkPbpsIu657ySbv84EWWdiaSI"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $cron$
);
