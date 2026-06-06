-- TikTok social posting: connected-account token storage + OAuth (PKCE) pending
-- state, mirroring the existing X (x_account_tokens / x_oauth_pending) tables.

-- 1. Connected TikTok accounts. TikTok identifies a user per-app by `open_id`,
--    so that is the natural conflict key (the equivalent of X's account_handle).
CREATE TABLE public.tiktok_account_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  open_id text NOT NULL UNIQUE,
  display_name text,
  username text,
  avatar_url text,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  refresh_expires_at timestamptz,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tiktok_account_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view tiktok_account_tokens"
ON public.tiktok_account_tokens FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert tiktok_account_tokens"
ON public.tiktok_account_tokens FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update tiktok_account_tokens"
ON public.tiktok_account_tokens FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete tiktok_account_tokens"
ON public.tiktok_account_tokens FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Belt-and-suspenders: a RESTRICTIVE policy so only admins or service_role can
-- ever touch tokens, even if a permissive policy is added later by mistake
-- (mirrors the x_account_tokens hardening).
CREATE POLICY "tiktok_account_tokens admin-or-service only (restrictive)"
ON public.tiktok_account_tokens
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_tiktok_account_tokens_updated_at
BEFORE UPDATE ON public.tiktok_account_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Pending PKCE state for the OAuth handshake (service-role only).
CREATE TABLE public.tiktok_oauth_pending (
  state text PRIMARY KEY,
  code_verifier text NOT NULL,
  user_id uuid NOT NULL,
  redirect_uri text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tiktok_oauth_pending ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages tiktok_oauth_pending"
  ON public.tiktok_oauth_pending FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_tiktok_oauth_pending_created_at ON public.tiktok_oauth_pending (created_at);

-- 3. Automatic cleanup of stale PKCE rows (older than 15 minutes).
CREATE OR REPLACE FUNCTION public.cleanup_tiktok_oauth_pending()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.tiktok_oauth_pending
  WHERE created_at < now() - interval '15 minutes';
$$;

REVOKE ALL ON FUNCTION public.cleanup_tiktok_oauth_pending() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_tiktok_oauth_pending() TO service_role;

-- Schedule cleanup every 10 minutes if pg_cron is available.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup-tiktok-oauth-pending')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-tiktok-oauth-pending');
    PERFORM cron.schedule(
      'cleanup-tiktok-oauth-pending',
      '*/10 * * * *',
      $cron$ SELECT public.cleanup_tiktok_oauth_pending(); $cron$
    );
  END IF;
END $$;
