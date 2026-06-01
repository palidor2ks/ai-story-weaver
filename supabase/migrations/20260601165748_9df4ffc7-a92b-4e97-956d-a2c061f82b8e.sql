-- Manually seed William Lawrence (Republican, Piscataway Ward 1) as a stopgap
-- until our AI / Civic ingestion picks up Middlesex County GOP primary filings.

INSERT INTO public.candidates (
  id, name, party, office, state, district,
  is_incumbent, coverage_tier, confidence, answers_source,
  overall_score, score_version
)
VALUES (
  'manual_william_lawrence_piscataway_w1',
  'William Lawrence',
  'Republican',
  'Ward 1 Council Member',
  'NJ',
  '1',
  false,
  'tier_3',
  'low',
  'pending_research',
  0.00,
  'v1.0'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.election_candidates (
  election_id, candidate_id, office, is_incumbent, status, source, source_ref
)
VALUES (
  'c8b26908-234b-445a-bf3e-e0d427d7daab',
  'manual_william_lawrence_piscataway_w1',
  'Ward 1 Council Member',
  false,
  'qualified',
  'manual_backfill',
  'https://www.middlesexcountynj.gov/government/departments/county-clerk/elections'
)
ON CONFLICT DO NOTHING;