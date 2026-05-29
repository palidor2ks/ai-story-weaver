
-- 1. Fix avatars storage policies: bucket is public; replace misleading owner-only SELECT with a public-read policy
DROP POLICY IF EXISTS "Users can read their own avatar object" ON storage.objects;

CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'avatars');

-- 2. Harden x_account_tokens with a RESTRICTIVE policy so only admins or service_role can ever access tokens,
--    even if a future permissive policy is added by mistake.
CREATE POLICY "x_account_tokens admin-or-service only (restrictive)"
ON public.x_account_tokens
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Add automatic cleanup for stale PKCE rows in x_oauth_pending (older than 15 minutes)
CREATE OR REPLACE FUNCTION public.cleanup_x_oauth_pending()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.x_oauth_pending
  WHERE created_at < now() - interval '15 minutes';
$$;

REVOKE ALL ON FUNCTION public.cleanup_x_oauth_pending() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_x_oauth_pending() TO service_role;

-- Schedule cleanup every 10 minutes if pg_cron is available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup-x-oauth-pending')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-x-oauth-pending');
    PERFORM cron.schedule(
      'cleanup-x-oauth-pending',
      '*/10 * * * *',
      $cron$ SELECT public.cleanup_x_oauth_pending(); $cron$
    );
  END IF;
END $$;
