-- Schedule monthly donor sync on the 1st of every month at 3am UTC
SELECT cron.schedule(
  'monthly-donor-sync',
  '0 3 1 * *',
  $$
  SELECT net.http_post(
    url:='https://ornnzinjrcyigazecctf.supabase.co/functions/v1/sync-all-donors',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybm56aW5qcmN5aWdhemVjY3RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyOTAwMjgsImV4cCI6MjA4MTg2NjAyOH0.hijd7BMAA5g-C4vH5OHkPbpsIu657ySbv84EWWdiaSI"}'::jsonb,
    body:='{"cycle": "2024"}'::jsonb
  ) as request_id;
  $$
);