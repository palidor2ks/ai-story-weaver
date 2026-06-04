-- Curate authoritative ward/council-district boundary sources so vetted
-- government layers resolve at HIGH confidence (no "verify" note) instead of
-- via runtime discovery + seat cross-check.

-- Allow a curated override to name the exact attribute holding the division,
-- for layers whose field name is too generic to auto-detect (e.g. Newark's
-- ward sits in a field literally called "Name").
ALTER TABLE public.district_boundary_overrides
  ADD COLUMN IF NOT EXISTS field_name text;

-- Trusted ArcGIS owners / org ids (lowercased). Discovered layers from these
-- are treated as authoritative ("gov") for any city they serve.
INSERT INTO public.trusted_gis_owners (owner_key, label) VALUES
  ('cohgis_ago',          'City of Houston GIS'),
  ('nummvbqzsijkuevr',    'City of Houston GIS org'),
  ('xanuvx6vemybnvyd',    'City of Winston-Salem org'),
  ('maricopaelectionsgis','Maricopa County Elections GIS'),
  ('ykpntm6e3thvzkrj',    'Maricopa County Elections GIS org')
ON CONFLICT (owner_key) DO NOTHING;

-- Authoritative per-city boundary sources, each verified by point-in-polygon:
--   Houston (letters A-K), Chicago (numbered wards), Winston-Salem (directional
--   names), Glendale (named districts; multi-city layer → verify Juris),
--   Newark (directional; ward held in the generic "Name" field).
INSERT INTO public.district_boundary_overrides (state, city, query_url, muni_field, field_name, label) VALUES
  ('TX', 'Houston',
   'https://services.arcgis.com/NummVBqZSIJKUeVR/arcgis/rest/services/Houston_Council_Districts_view/FeatureServer/2/query',
   NULL, NULL, 'City of Houston council districts (A-K)'),
  ('IL', 'Chicago',
   'https://services.arcgis.com/F7DSX1DSNSiWmOqh/arcgis/rest/services/ChicagoWards/FeatureServer/18/query',
   NULL, NULL, 'Chicago wards'),
  ('NC', 'Winston-Salem',
   'https://services.arcgis.com/XAnuVx6VEMybNvyd/arcgis/rest/services/City_of_Winston-Salem_Wards/FeatureServer/0/query',
   NULL, NULL, 'City of Winston-Salem wards (directional)'),
  ('AZ', 'Glendale',
   'https://services.arcgis.com/ykpntM6e3tHvzKRJ/arcgis/rest/services/Maricopa_County_City_Council_Districts/FeatureServer/0/query',
   'Juris', NULL, 'Maricopa County council districts (Glendale, named)'),
  ('NJ', 'Newark',
   'https://services7.arcgis.com/ZodPOMBKsdAsTqF4/arcgis/rest/services/NJ_Newark_Wards_and_Demographics/FeatureServer/62/query',
   NULL, 'Name', 'Newark wards (directional; ward in "Name" field)')
ON CONFLICT (state, city) DO UPDATE SET
  query_url = EXCLUDED.query_url,
  muni_field = EXCLUDED.muni_field,
  field_name = EXCLUDED.field_name,
  label = EXCLUDED.label,
  is_active = true;
