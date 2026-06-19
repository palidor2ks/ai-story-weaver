-- Add nolan_axis column to topics so each topic can be tagged for the Nolan Chart.
-- economic: topic measures economic freedom (positive answer = more free market)
-- personal: topic measures personal freedom (negative answer = more civil liberties)
-- null: topic doesn't map cleanly to either axis (excluded from chart computation)

ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS nolan_axis text
  CHECK (nolan_axis IN ('economic', 'personal'));

-- Economic freedom axis: taxation, regulation, spending, market policy
UPDATE topics SET nolan_axis = 'economic'
WHERE id IN (
  'economy-work',
  'health-safety-net',
  'environment-energy',
  'local-cost-of-living',
  'local-housing',
  'government-democracy',
  'local-education',
  'local-public-health'
);

-- Personal freedom axis: civil liberties, criminal justice, security vs liberty
-- Direction is inverted: negative (left) answer = more civil liberties = higher personal freedom
UPDATE topics SET nolan_axis = 'personal'
WHERE id IN (
  'rights-justice',
  'local-public-safety',
  'national-security-borders'
);
