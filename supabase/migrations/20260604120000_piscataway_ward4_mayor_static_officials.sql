-- Backfill two Piscataway local officials that existed only in candidate_overrides
-- but were missing from static_officials: the Mayor and the Ward 4 council member.
--
-- Why this matters: fetch-civic-officials uses static_officials.city as the source
-- of truth for city-scoping. Rows absent from static_officials are treated as
-- "city-agnostic" and leak to EVERY NJ user. Adding them with city='Piscataway'
-- scopes them correctly, and gives the Ward 4 seat a ward so the new ward filter
-- can include/exclude it based on the user's resolved ward.

INSERT INTO public.static_officials
  (id, name, party, office, level, state, district, city, image_url, coverage_tier, confidence, is_active)
VALUES
  ('mayor_nj_piscataway',
   'Brian Wahler', 'Democrat', 'Mayor of Piscataway', 'local', 'NJ', NULL, 'Piscataway',
   'https://www.piscatawaynj.org/ImageRepository/Document?documentID=10678', 'tier_3', 'medium', true),
  ('local_nj_piscataway_town_council_member_michele_lombardi',
   'Michele Lombardi', 'Democrat', 'Town Council Member, Piscataway (Ward 4)', 'local', 'NJ', 'Ward 4', 'Piscataway',
   NULL, 'tier_3', 'medium', true)
ON CONFLICT (id) DO UPDATE SET
  name    = EXCLUDED.name,
  party   = EXCLUDED.party,
  office  = EXCLUDED.office,
  level   = EXCLUDED.level,
  state   = EXCLUDED.state,
  district = EXCLUDED.district,
  city    = EXCLUDED.city,
  is_active = true,
  updated_at = now();
