
DO $$
DECLARE
  v_secret text;
  v_anon   text;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret';
  SELECT decrypted_secret INTO v_anon   FROM vault.decrypted_secrets WHERE name = 'nj_elec_cron_anon_key';

  -- discover-fec-candidates (every 6h)
  PERFORM cron.schedule(
    'discover-fec-candidates',
    '5 */6 * * *',
    format($cmd$
      select net.http_post(
        url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/discover-fec-candidates',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'apikey', %L,
          'x-cron-secret', %L
        ),
        body := '{"maxPages":8}'::jsonb
      );
    $cmd$, v_anon, v_secret)
  );

  -- drain-research-queue (every 30 min)
  PERFORM cron.schedule(
    'drain-research-queue',
    '*/30 * * * *',
    format($cmd$
      select net.http_post(
        url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/drain-research-queue',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'apikey', %L,
          'x-cron-secret', %L
        ),
        body := '{"batchSize":5}'::jsonb
      );
    $cmd$, v_anon, v_secret)
  );

  -- pick-daily-stat-card (hourly)
  PERFORM cron.schedule(
    'pick-daily-stat-card-hourly',
    '0 * * * *',
    format($cmd$
      SELECT net.http_post(
        url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/pick-daily-stat-card',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'apikey', %L,
          'x-cron-secret', %L
        ),
        body := '{}'::jsonb
      );
    $cmd$, v_anon, v_secret)
  );

  -- drain-fec-finance (every 10 min)
  PERFORM cron.schedule(
    'drain-fec-finance',
    '*/10 * * * *',
    format($cmd$
      select net.http_post(
        url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/drain-fec-finance',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization', 'Bearer ' || %L,
          'apikey', %L,
          'x-cron-secret', %L
        ),
        body := '{"cycle":"2026","resumeBatch":3,"totalsBatch":12}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cmd$, v_anon, v_anon, v_secret)
  );
END $$;
