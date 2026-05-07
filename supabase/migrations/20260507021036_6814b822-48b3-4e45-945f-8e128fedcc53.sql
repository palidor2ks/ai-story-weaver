-- Add Mikie Sherrill as NJ Governor directly in candidate_overrides
INSERT INTO candidate_overrides (candidate_id, name, party, office, state, is_active)
VALUES ('nj_governor_sherrill', 'Mikie Sherrill', 'Democrat', 'Governor', 'NJ', true)
ON CONFLICT (candidate_id) DO UPDATE SET name = 'Mikie Sherrill', party = 'Democrat', office = 'Governor', state = 'NJ', is_active = true;

-- Fix Dale Caldwell to Lt Governor if he exists
UPDATE candidate_overrides SET office = 'Lieutenant Governor' 
WHERE state = 'NJ' AND name = 'Dale Caldwell' AND office = 'Governor';

-- Add transition record for reference
INSERT INTO official_transitions (official_name, current_office, new_office, state, party, election_date, inauguration_date, transition_type, verified, is_active)
VALUES ('Mikie Sherrill', NULL, 'Governor', 'NJ', 'Democrat', '2025-11-04', '2026-01-20', 'elected', true, true)
ON CONFLICT DO NOTHING;