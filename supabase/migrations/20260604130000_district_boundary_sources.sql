-- Cache of resolved ward / city-council-district boundary services, keyed by
-- (state, city). The fetch-civic-officials edge function discovers a municipality's
-- ward/district polygon service on ArcGIS Online once, then reuses the winning
-- source here so later lookups are a single point-in-polygon query. `status='none'`
-- records a confirmed miss so we don't re-run discovery for every request.

CREATE TABLE IF NOT EXISTS public.district_boundary_sources (
  state      text NOT NULL,
  city       text NOT NULL,
  status     text NOT NULL DEFAULT 'none' CHECK (status IN ('found', 'none')),
  query_url  text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (state, city)
);

ALTER TABLE public.district_boundary_sources ENABLE ROW LEVEL SECURITY;

-- Written and read by the edge function via the service role (which bypasses
-- RLS). Expose read-only to admins for debugging; no other client access.
CREATE POLICY "Admins can view district boundary sources"
  ON public.district_boundary_sources FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
