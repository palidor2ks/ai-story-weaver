CREATE TABLE public.ai_analysis_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  subject_id text NOT NULL,
  cycle text,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  input_fingerprint text,
  payload jsonb NOT NULL,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique cache key (NULLs treated distinctly via coalesce-based index)
CREATE UNIQUE INDEX ai_analysis_cache_key_idx
  ON public.ai_analysis_cache (
    kind,
    subject_id,
    COALESCE(cycle, ''),
    COALESCE(user_id::text, ''),
    COALESCE(input_fingerprint, '')
  );

CREATE INDEX ai_analysis_cache_lookup_idx
  ON public.ai_analysis_cache (kind, subject_id);

ALTER TABLE public.ai_analysis_cache ENABLE ROW LEVEL SECURITY;

-- Global rows (user_id IS NULL): publicly readable
CREATE POLICY "Global AI analysis cache readable by everyone"
  ON public.ai_analysis_cache
  FOR SELECT
  USING (user_id IS NULL);

-- Per-user rows: only the owner can read
CREATE POLICY "Users can read their own AI analysis cache"
  ON public.ai_analysis_cache
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role full access (edge functions handle writes)
CREATE POLICY "Service role manages AI analysis cache"
  ON public.ai_analysis_cache
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Update trigger
CREATE TRIGGER update_ai_analysis_cache_updated_at
  BEFORE UPDATE ON public.ai_analysis_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();