-- Add x_handle to candidates
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS x_handle text;

-- Create representative_social_posts table keyed by candidate_id
CREATE TABLE IF NOT EXISTS public.representative_social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id text NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'x' CHECK (platform IN ('x')),
  handle text NOT NULL,
  post_id text NOT NULL,
  post_url text NOT NULL,
  post_text text,
  posted_at timestamptz NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, post_id)
);

CREATE INDEX IF NOT EXISTS idx_rep_social_posts_candidate_posted_at
  ON public.representative_social_posts(candidate_id, posted_at DESC);

GRANT SELECT ON public.representative_social_posts TO anon;
GRANT SELECT ON public.representative_social_posts TO authenticated;
GRANT ALL ON public.representative_social_posts TO service_role;

ALTER TABLE public.representative_social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "representative_social_posts public read"
  ON public.representative_social_posts
  FOR SELECT
  USING (true);

CREATE POLICY "representative_social_posts admin write"
  ON public.representative_social_posts
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));