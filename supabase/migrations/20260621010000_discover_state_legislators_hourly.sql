-- Bump state-legislator discovery from weekly (Mon 07:30) to hourly (:40), so a newly-visible
-- state (removed from hidden_states) is discovered within the hour instead of waiting up to a
-- week. Discovery is cheap — it only writes directory rows and does NOT call kickResearch, so no
-- Gemini spend; answer generation stays on its own batch-populate cadence. Renamed from
-- 'discover-state-legislators-weekly' to match the new cadence. :40 avoids the other cron minutes
-- (:00/:05/:15/:20/:30/:35/:45/:50, */15). CRON GATE migration (guardrail #2).
DO $$ BEGIN PERFORM cron.unschedule('discover-state-legislators-weekly'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('discover-state-legislators-hourly'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('discover-state-legislators-hourly', '40 * * * *', $cron$
  select net.http_post(
    url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/discover-state-legislators',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
$cron$);
