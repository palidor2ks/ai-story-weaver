-- Social stat card drafts, publishing workflow, and post history
CREATE TABLE IF NOT EXISTS public.social_stat_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url text NOT NULL,
  source_title text NOT NULL DEFAULT '',
  stat_title text NOT NULL,
  stat_value text NOT NULL,
  stat_context text NOT NULL DEFAULT '',
  source_label text NOT NULL DEFAULT '',
  caption text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'posted', 'failed')),
  share_card_id text REFERENCES public.share_cards(id) ON DELETE SET NULL,
  share_url text,
  image_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_stat_card_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.social_stat_cards(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('x', 'facebook', 'instagram', 'linkedin', 'tiktok')),
  status text NOT NULL CHECK (status IN ('success', 'failed')),
  remote_post_id text,
  remote_post_url text,
  error text,
  posted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_stat_cards_status_created_idx
  ON public.social_stat_cards(status, created_at DESC);
CREATE INDEX IF NOT EXISTS social_stat_cards_created_by_idx
  ON public.social_stat_cards(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS social_stat_card_posts_card_idx
  ON public.social_stat_card_posts(card_id, posted_at DESC);

ALTER TABLE public.social_stat_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_stat_card_posts ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.social_stat_cards TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.social_stat_cards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_stat_card_posts TO authenticated;


DROP POLICY IF EXISTS "Admins manage social stat cards" ON public.social_stat_cards;
CREATE POLICY "Admins manage social stat cards"
  ON public.social_stat_cards
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Published social stat cards are public" ON public.social_stat_cards;
CREATE POLICY "Published social stat cards are public"
  ON public.social_stat_cards
  FOR SELECT
  TO anon, authenticated
  USING (status IN ('approved', 'posted'));

DROP POLICY IF EXISTS "Admins manage social stat card posts" ON public.social_stat_card_posts;
CREATE POLICY "Admins manage social stat card posts"
  ON public.social_stat_card_posts
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.set_social_stat_cards_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS social_stat_cards_set_updated_at ON public.social_stat_cards;
CREATE TRIGGER social_stat_cards_set_updated_at
  BEFORE UPDATE ON public.social_stat_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.set_social_stat_cards_updated_at();
