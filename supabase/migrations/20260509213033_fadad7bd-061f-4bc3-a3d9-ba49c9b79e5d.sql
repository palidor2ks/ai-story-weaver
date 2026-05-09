CREATE TABLE public.civic_lookup_cache (
  normalized_address text PRIMARY KEY,
  lat numeric,
  lng numeric,
  state text,
  district text,
  city text,
  matched_address text,
  payload jsonb,
  cached_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_civic_lookup_cache_cached_at ON public.civic_lookup_cache(cached_at);

ALTER TABLE public.civic_lookup_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cache is readable by authenticated users"
ON public.civic_lookup_cache
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Service role can manage cache"
ON public.civic_lookup_cache
FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');