-- Substack newsletter digest: "generate, you publish" (no Substack API).
--
-- Substack has no official publishing API, so we never post to it automatically.
-- Instead a periodic job compiles recent social_posts into a long-form Markdown
-- digest and stores it as a DRAFT for an admin to review, edit, copy, and paste
-- into the Substack editor. This path depends on nothing unofficial/fragile.

-- 1. Settings: gate + cadence for the auto-generated digest. Kept independent of
--    the X/TikTok auto-post `mode` so the newsletter can run without auto-tweeting.
ALTER TABLE public.social_post_settings
  ADD COLUMN IF NOT EXISTS substack_enabled           BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS substack_frequency_days    INTEGER     NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS substack_lookback_days     INTEGER     NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS substack_publication_url   TEXT,
  ADD COLUMN IF NOT EXISTS substack_last_generated_at TIMESTAMPTZ;

-- 2. Generated digests. One row per edition; the admin edits it in place, copies
--    the Markdown into Substack, then marks it published.
CREATE TABLE IF NOT EXISTS public.substack_digests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  subtitle        TEXT,
  body_markdown   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',  -- draft | published | archived
  period_start    TIMESTAMPTZ,
  period_end      TIMESTAMPTZ,
  source_post_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  item_count      INTEGER NOT NULL DEFAULT 0,
  model           TEXT,
  created_by      UUID,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_substack_digests_status
  ON public.substack_digests(status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.substack_digests TO authenticated;
GRANT ALL ON public.substack_digests TO service_role;

ALTER TABLE public.substack_digests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage substack_digests" ON public.substack_digests;
CREATE POLICY "Admins manage substack_digests"
  ON public.substack_digests FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role manages substack_digests" ON public.substack_digests;
CREATE POLICY "Service role manages substack_digests"
  ON public.substack_digests FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS trg_substack_digests_updated_at ON public.substack_digests;
CREATE TRIGGER trg_substack_digests_updated_at
  BEFORE UPDATE ON public.substack_digests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Schedule the generator daily. The function self-gates on substack_enabled
--    and substack_frequency_days, so a daily tick produces an edition only when
--    one is actually due; when disabled it is a no-op. Safe to schedule now.
DO $$
DECLARE
  v_secret text;
  v_anon   text;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret';
  SELECT decrypted_secret INTO v_anon   FROM vault.decrypted_secrets WHERE name = 'nj_elec_cron_anon_key';

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate-substack-digest') THEN
    PERFORM cron.unschedule('generate-substack-digest');
  END IF;

  PERFORM cron.schedule(
    'generate-substack-digest',
    '0 14 * * *',
    format($cmd$
      SELECT net.http_post(
        url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/generate-substack-digest',
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
