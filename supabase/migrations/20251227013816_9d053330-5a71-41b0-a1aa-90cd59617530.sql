-- Insert Presidential candidates with FEC IDs as primary key
INSERT INTO candidates (id, name, party, office, state, fec_candidate_id, is_incumbent, coverage_tier, confidence)
VALUES 
  ('P80001571', 'Donald J. Trump', 'Republican', 'President', 'US', 'P80001571', false, 'tier_2', 'medium'),
  ('P80000722', 'Joseph R. Biden Jr', 'Democrat', 'President', 'US', 'P80000722', true, 'tier_2', 'medium'),
  ('P00009423', 'Kamala D. Harris', 'Democrat', 'President', 'US', 'P00009423', false, 'tier_2', 'medium')
ON CONFLICT (id) DO UPDATE SET
  fec_candidate_id = EXCLUDED.fec_candidate_id,
  office = EXCLUDED.office,
  last_updated = NOW();