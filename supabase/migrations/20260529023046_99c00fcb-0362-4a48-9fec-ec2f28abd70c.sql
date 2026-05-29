
-- social_posts: one draft per day per subject
CREATE TABLE public.social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL DEFAULT 'rep_profile',
  subject_id TEXT NOT NULL,
  subject_label TEXT,
  stat_key TEXT,
  stat_payload JSONB DEFAULT '{}'::jsonb,
  image_path TEXT,
  image_url TEXT,
  share_url TEXT,
  share_card_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review',
  scheduled_for TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  rejected_reason TEXT,
  created_by UUID,
  reviewed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_social_posts_status ON public.social_posts(status, created_at DESC);
CREATE INDEX idx_social_posts_subject ON public.social_posts(subject_type, subject_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_posts TO authenticated;
GRANT ALL ON public.social_posts TO service_role;

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage social_posts"
  ON public.social_posts FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages social_posts"
  ON public.social_posts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_social_posts_updated_at
  BEFORE UPDATE ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- social_post_platforms
CREATE TABLE public.social_post_platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  caption TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'pending',
  external_post_id TEXT,
  external_url TEXT,
  error_message TEXT,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, platform)
);

CREATE INDEX idx_social_post_platforms_post ON public.social_post_platforms(post_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_post_platforms TO authenticated;
GRANT ALL ON public.social_post_platforms TO service_role;

ALTER TABLE public.social_post_platforms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage social_post_platforms"
  ON public.social_post_platforms FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages social_post_platforms"
  ON public.social_post_platforms FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_social_post_platforms_updated_at
  BEFORE UPDATE ON public.social_post_platforms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- social_post_settings: singleton
CREATE TABLE public.social_post_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  mode TEXT NOT NULL DEFAULT 'manual',
  post_time_local TEXT NOT NULL DEFAULT '19:00',
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  auto_approve_after_hours INTEGER NOT NULL DEFAULT 2,
  x_enabled BOOLEAN NOT NULL DEFAULT true,
  facebook_enabled BOOLEAN NOT NULL DEFAULT false,
  instagram_enabled BOOLEAN NOT NULL DEFAULT false,
  tiktok_enabled BOOLEAN NOT NULL DEFAULT false,
  recent_skip_days INTEGER NOT NULL DEFAULT 30,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT social_post_settings_singleton CHECK (id = 1)
);

INSERT INTO public.social_post_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_post_settings TO authenticated;
GRANT ALL ON public.social_post_settings TO service_role;

ALTER TABLE public.social_post_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage social_post_settings"
  ON public.social_post_settings FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages social_post_settings"
  ON public.social_post_settings FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_social_post_settings_updated_at
  BEFORE UPDATE ON public.social_post_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
