CREATE TABLE public.x_oauth_pending (
  state text PRIMARY KEY,
  code_verifier text NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.x_oauth_pending ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages x_oauth_pending"
  ON public.x_oauth_pending FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_x_oauth_pending_created_at ON public.x_oauth_pending (created_at);