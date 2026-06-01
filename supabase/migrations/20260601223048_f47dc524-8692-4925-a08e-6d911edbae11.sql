-- Reduce automated congress donor sync batches to one candidate per invocation.
-- We avoid re-embedding the anon JWT by reading the existing job's headers/url
-- out of cron.job and re-scheduling with a body that pins limit=1.
DO $$
DECLARE
  v_backfill_cmd text;
  v_refresh_cmd text;
  v_headers text;
  v_url text;
BEGIN
  SELECT command INTO v_backfill_cmd FROM cron.job WHERE jobname = 'congress-donor-backfill-10m';
  SELECT command INTO v_refresh_cmd  FROM cron.job WHERE jobname = 'congress-donor-refresh-daily';

  IF v_backfill_cmd IS NULL OR v_refresh_cmd IS NULL THEN
    RAISE NOTICE 'Donor sync cron jobs not found; skipping limit reduction.';
    RETURN;
  END IF;

  -- Extract the url and headers literals from the existing scheduled net.http_post call.
  v_url     := (regexp_match(v_backfill_cmd, 'url\s*:=\s*''([^'']+)'''))[1];
  v_headers := (regexp_match(v_backfill_cmd, 'headers\s*:=\s*''([^'']+)'''))[1];

  IF v_url IS NULL OR v_headers IS NULL THEN
    RAISE NOTICE 'Could not parse url/headers from existing cron command; aborting.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('congress-donor-backfill-10m');
  PERFORM cron.unschedule('congress-donor-refresh-daily');

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
      v_url,
      v_headers,
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
      v_url,
      v_headers,
      json_build_object('scope','congress_visible','mode','refresh','limit',1,'cycle','2024')::text
    )
  );
END $$;