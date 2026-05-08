
ALTER TABLE public.static_officials
  ADD COLUMN IF NOT EXISTS city text;

CREATE INDEX IF NOT EXISTS idx_static_officials_state_city_level
  ON public.static_officials (state, city, level)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.mayor_fetch_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL,
  city text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  last_attempted_at timestamptz,
  completed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  error text,
  resulting_candidate_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (state, city)
);

ALTER TABLE public.mayor_fetch_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mayor fetch queue is viewable by everyone"
  ON public.mayor_fetch_queue FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage mayor fetch queue"
  ON public.mayor_fetch_queue FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage mayor fetch queue"
  ON public.mayor_fetch_queue FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER update_mayor_fetch_queue_updated_at
  BEFORE UPDATE ON public.mayor_fetch_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
