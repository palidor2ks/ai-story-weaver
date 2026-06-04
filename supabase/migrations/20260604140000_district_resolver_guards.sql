-- Confidence-aware guards for ward / council-district resolution.

-- 1. Annotate discovered sources with confidence, the ArcGIS owner, and an
--    admin review flag (approved = null:unreviewed / true:always trust /
--    false:never use).
ALTER TABLE public.district_boundary_sources
  ADD COLUMN IF NOT EXISTS confidence   text NOT NULL DEFAULT 'low'
    CHECK (confidence IN ('high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS source_owner text,
  ADD COLUMN IF NOT EXISTS approved     boolean;

-- 2. Admin-curated authoritative boundary sources (highest priority). This is
--    where a vetted/official list of ward & council-district services is
--    uploaded. `city = '*'` applies the source statewide (like a registry
--    entry); a specific city overrides the statewide row. `muni_field`, when
--    set, is the attribute used to confirm the polygon's municipality on
--    statewide layers.
CREATE TABLE IF NOT EXISTS public.district_boundary_overrides (
  state      text NOT NULL,
  city       text NOT NULL DEFAULT '*',
  query_url  text NOT NULL,
  muni_field text,
  label      text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (state, city)
);
ALTER TABLE public.district_boundary_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage district boundary overrides"
  ON public.district_boundary_overrides FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Allowlist of trusted ArcGIS owners / org ids. A discovered source whose
--    owner (username) or org hash (from the services<N>.arcgis.com/<hash>/ URL)
--    is listed here is treated as authoritative ("gov") instead of community.
--    Government-hosted servers (*.gov / *.mil / non-ArcGIS *.us) are trusted
--    automatically and need no entry here.
CREATE TABLE IF NOT EXISTS public.trusted_gis_owners (
  owner_key  text PRIMARY KEY,   -- lowercased ArcGIS owner username OR org hash
  label      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trusted_gis_owners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage trusted gis owners"
  ON public.trusted_gis_owners FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed a couple of confirmed-authoritative owners (NJ Office of GIS + its org).
INSERT INTO public.trusted_gis_owners (owner_key, label) VALUES
  ('njogis', 'NJ Office of GIS'),
  ('xvoqajtoj5p6ngmu', 'NJ OGIS hosted org (services2.arcgis.com)')
ON CONFLICT (owner_key) DO NOTHING;
