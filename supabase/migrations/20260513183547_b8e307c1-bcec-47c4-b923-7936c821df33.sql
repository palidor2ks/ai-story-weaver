
ALTER TABLE public.polls ADD COLUMN IF NOT EXISTS share_platforms text[] DEFAULT '{}'::text[];
ALTER TABLE public.polls ADD COLUMN IF NOT EXISTS auto_post boolean DEFAULT true;
ALTER TABLE public.polls ADD COLUMN IF NOT EXISTS share_caption text;

CREATE TABLE IF NOT EXISTS public.poll_social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  platform text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  remote_post_id text,
  remote_post_url text,
  error text,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poll_social_posts_poll ON public.poll_social_posts(poll_id);

ALTER TABLE public.poll_social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage poll_social_posts"
  ON public.poll_social_posts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can view posts for published polls"
  ON public.poll_social_posts FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.polls p WHERE p.id = poll_id AND p.status = 'published'));

INSERT INTO storage.buckets (id, name, public)
VALUES ('poll-og', 'poll-og', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read poll-og"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'poll-og');

CREATE POLICY "Admins write poll-og"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'poll-og' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role write poll-og"
  ON storage.objects FOR ALL
  USING (bucket_id = 'poll-og' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'poll-og' AND auth.role() = 'service_role');
