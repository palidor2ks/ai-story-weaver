-- Reduce automated congress donor sync batches to one candidate per invocation.
-- A single candidate donor import can approach the Edge Function timeout while it
-- paginates/retries FEC data; larger cron batches were causing HTTP 504 run logs.
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
      json_build_object('scope','congress_visible','mode','backfill','limit',1,'cycle','2024')::text
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
      json_build_object('scope','congress_visible','mode','refresh','limit',1,'cycle','2024')::text
    )
  );
END $$;
