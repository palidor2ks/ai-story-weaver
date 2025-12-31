-- Add Mikie Sherrill as incoming NJ Governor (elected November 2025)
INSERT INTO official_transitions (
  official_name,
  current_office,
  new_office,
  state,
  district,
  party,
  election_date,
  inauguration_date,
  transition_type,
  source_url,
  ai_confidence,
  verified,
  is_active
) VALUES (
  'Mikie Sherrill',
  'U.S. Representative',
  'Governor',
  'NJ',
  NULL,
  'Democrat',
  '2025-11-04',
  '2026-01-21',
  'elected',
  'https://ballotpedia.org/Mikie_Sherrill',
  'high',
  true,
  true
);