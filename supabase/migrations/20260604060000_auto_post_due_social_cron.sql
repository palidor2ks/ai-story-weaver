-- Schedule the auto-post orchestrator. Every 15 minutes it checks
-- social_post_settings.mode; when 'auto' it renders + posts any draft that has
-- waited longer than auto_approve_after_hours. In 'manual' mode the function
-- is a no-op, so this schedule is safe to enable before auto mode is turned on.
DO $$
DECLARE
  v_secret text;
  v_anon   text;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret';
  SELECT decrypted_secret INTO v_anon   FROM vault.decrypted_secrets WHERE name = 'nj_elec_cron_anon_key';

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-post-due-social') THEN
    PERFORM cron.unschedule('auto-post-due-social');
  END IF;

  PERFORM cron.schedule(
    'auto-post-due-social',
    '*/15 * * * *',
    format($cmd$
      SELECT net.http_post(
        url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/auto-post-due',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'apikey', %L,
          'x-cron-secret', %L
        ),
        body := '{}'::jsonb
      );
    $cmd$, v_anon, v_secret)
  );
END $$;
