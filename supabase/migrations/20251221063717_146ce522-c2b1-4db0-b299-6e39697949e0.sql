-- Mark one question per topic as onboarding canonical
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 1 WHERE id IN (
  'cj1',      -- Criminal Justice
  'tech1',    -- Technology
  'health1',  -- Healthcare
  'env1',     -- Environment
  'eco1',     -- Economy
  'gov1',     -- Government Reform
  'erm1',     -- Electoral Reform
  'edu1',     -- Education
  'social4',  -- Social Issues
  'dp1',      -- Domestic Policy
  'immi1',    -- Immigration
  'fp1',      -- Foreign Policy
  'cr1',      -- Civil Rights
  'ct1',      -- China/Taiwan
  'ip1'       -- Israel/Palestine
);

-- Verify the update
SELECT id, topic_id, is_onboarding_canonical, onboarding_slot FROM questions WHERE is_onboarding_canonical = true;