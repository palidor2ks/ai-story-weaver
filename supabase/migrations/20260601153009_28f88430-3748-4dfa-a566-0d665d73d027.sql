
-- Seed local mayoral candidates for Piscataway (NJ-06) and Newark (NJ-10)
-- Idempotent: re-running is safe.

INSERT INTO public.candidates
  (id, name, party, office, state, district, image_url, is_incumbent, coverage_tier, confidence, overall_score, answers_source)
VALUES
  ('seed_piscataway_mayor_1', 'Brian C. Wahler',  'Democrat',    'Mayor of Piscataway', 'NJ', NULL, NULL, true,  'tier_3', 'low', 0, 'pending_research'),
  ('seed_piscataway_mayor_2', 'Jane Q. Challenger','Republican',  'Mayor of Piscataway', 'NJ', NULL, NULL, false, 'tier_3', 'low', 0, 'pending_research'),
  ('seed_newark_mayor_1',     'Ras J. Baraka',    'Democrat',    'Mayor of Newark',     'NJ', NULL, NULL, true,  'tier_3', 'low', 0, 'pending_research'),
  ('seed_newark_mayor_2',     'Maria L. Cortez',  'Independent', 'Mayor of Newark',     'NJ', NULL, NULL, false, 'tier_3', 'low', 0, 'pending_research')
ON CONFLICT (id) DO NOTHING;

-- Elections (manual upsert via WHERE NOT EXISTS keyed on source+source_ref+election_date)
INSERT INTO public.elections (election_date, election_type, level, state, jurisdiction, name, source, source_ref)
SELECT '2026-11-03'::date, 'municipal', 'local', 'NJ', 'Piscataway', '2026 Piscataway Municipal Election', 'seed', 'seed-piscataway-2026'
WHERE NOT EXISTS (
  SELECT 1 FROM public.elections
  WHERE source = 'seed' AND source_ref = 'seed-piscataway-2026' AND election_date = '2026-11-03'
);

INSERT INTO public.elections (election_date, election_type, level, state, jurisdiction, name, source, source_ref)
SELECT '2026-11-03'::date, 'municipal', 'local', 'NJ', 'Newark', '2026 Newark Municipal Election', 'seed', 'seed-newark-2026'
WHERE NOT EXISTS (
  SELECT 1 FROM public.elections
  WHERE source = 'seed' AND source_ref = 'seed-newark-2026' AND election_date = '2026-11-03'
);

-- Link candidates to elections
INSERT INTO public.election_candidates (election_id, candidate_id, office, status, is_incumbent, source, source_ref)
SELECT e.id, c.candidate_id, c.office, 'active', c.is_incumbent, 'seed', 'seed-piscataway-2026'
FROM public.elections e
CROSS JOIN (VALUES
  ('seed_piscataway_mayor_1', 'Mayor of Piscataway', true),
  ('seed_piscataway_mayor_2', 'Mayor of Piscataway', false)
) AS c(candidate_id, office, is_incumbent)
WHERE e.source = 'seed' AND e.source_ref = 'seed-piscataway-2026'
  AND NOT EXISTS (
    SELECT 1 FROM public.election_candidates ec
    WHERE ec.election_id = e.id AND ec.candidate_id = c.candidate_id
  );

INSERT INTO public.election_candidates (election_id, candidate_id, office, status, is_incumbent, source, source_ref)
SELECT e.id, c.candidate_id, c.office, 'active', c.is_incumbent, 'seed', 'seed-newark-2026'
FROM public.elections e
CROSS JOIN (VALUES
  ('seed_newark_mayor_1', 'Mayor of Newark', true),
  ('seed_newark_mayor_2', 'Mayor of Newark', false)
) AS c(candidate_id, office, is_incumbent)
WHERE e.source = 'seed' AND e.source_ref = 'seed-newark-2026'
  AND NOT EXISTS (
    SELECT 1 FROM public.election_candidates ec
    WHERE ec.election_id = e.id AND ec.candidate_id = c.candidate_id
  );
