-- Automatic candidate photo enrichment.
--
-- Newly-discovered candidates (discover-fec-candidates et al.) are inserted with
-- image_url = NULL and, being non-incumbents, have no bioguide_id — so the client-side
-- bioguide fallback can't render a photo for them either. Until now the only thing that
-- *stored* a photo was the admin-only "enrich photos" button. This schedules that same
-- worker (enrich-official-photos, 'missing' mode) on pg_cron so it both backfills the
-- existing backlog and keeps new candidates covered going forward.
--
-- Auth mirrors the NJ/FL/NY/IE finance crons: a dedicated shared secret kept in Vault,
-- sent as x-sync-secret and validated in-function via a service-role RPC. The secret is
-- generated at apply-time, so nothing sensitive is committed to source.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1) Seed the cron secret in Vault (generated here; never committed). Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'photo_enrich_secret') THEN
    PERFORM vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'photo_enrich_secret'
    );
  END IF;
END $$;

-- 2) Service-role validator (mirrors check_nj_sync_secret).
CREATE OR REPLACE FUNCTION public.check_photo_enrich_secret(p_token text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'photo_enrich_secret' AND decrypted_secret = p_token
  );
$function$;

-- 3) Schedule the drainer every 15 minutes (≈25 rows/run). Idempotent re-schedule.
DO $$ BEGIN PERFORM cron.unschedule('enrich-candidate-photos'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('enrich-candidate-photos', '*/15 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/enrich-official-photos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_publishable_key'),
      'x-sync-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'photo_enrich_secret')
    ),
    body := '{"mode":"missing","limit":25}'::jsonb,
    timeout_milliseconds := 150000
  );
$cron$);
