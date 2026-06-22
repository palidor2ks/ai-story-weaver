-- Weekly cron for NC General Assembly votes sync (beachhead Task 2).
-- Mode=drain resumes from the last completed page; mode=full (not scheduled here)
-- is triggered manually once per month for guaranteed completeness.
-- Runs Sunday 08:00 UTC — well clear of the hourly roster sweep (:40).
-- CRON GATE migration (guardrail #2).

DO $$ BEGIN PERFORM cron.unschedule('sync-nc-legislator-votes-weekly'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('sync-nc-legislator-votes-weekly', '0 8 * * 0', $cron$
  select net.http_post(
    url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/sync-nc-legislator-votes?mode=drain',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
$cron$);
