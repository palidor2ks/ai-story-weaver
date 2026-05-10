
-- share_cards table
CREATE TABLE public.share_cards (
  id text PRIMARY KEY,
  user_id uuid,
  image_path text NOT NULL,
  target_url text NOT NULL,
  og_title text NOT NULL,
  og_description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

ALTER TABLE public.share_cards ENABLE ROW LEVEL SECURITY;

-- Public read so unfurl crawlers via anon key work
CREATE POLICY "Share cards are publicly readable"
  ON public.share_cards FOR SELECT
  USING (true);

-- Only service role writes (no policies for insert/update/delete = denied for anon/auth)

CREATE INDEX share_cards_expires_at_idx ON public.share_cards(expires_at);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('share-cards', 'share-cards', true)
ON CONFLICT (id) DO NOTHING;

-- Public read for the bucket objects
CREATE POLICY "Share card images are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'share-cards');
