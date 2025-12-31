-- Insert federal executive officials into static_officials table
-- This enables their profiles to load correctly

INSERT INTO static_officials (id, name, party, office, level, state, is_active, coverage_tier, confidence)
VALUES 
  ('federal_president', 'Donald Trump', 'Republican', 'President of the United States', 'federal_executive', 'US', true, 'tier_1', 'high'),
  ('federal_vice_president', 'J.D. Vance', 'Republican', 'Vice President of the United States', 'federal_executive', 'US', true, 'tier_1', 'high')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  party = EXCLUDED.party,
  office = EXCLUDED.office,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Delete Trump's inverted answers so they can be regenerated correctly
DELETE FROM candidate_answers WHERE candidate_id = 'federal_president';

-- Delete stale override for Trump
DELETE FROM candidate_overrides WHERE candidate_id = 'federal_president';