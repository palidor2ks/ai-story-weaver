-- Reset all onboarding canonical flags first
UPDATE questions SET is_onboarding_canonical = false, onboarding_slot = NULL;

-- Set 2 questions per topic as onboarding canonical (slot 1 and 2)
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 1 WHERE id IN (
  'ct2',      -- China/Taiwan
  'cj10',     -- Criminal Justice
  'dp10',     -- Domestic Policy
  'eco1',     -- Economy
  'edu10',    -- Education
  'erm1',     -- Electoral Reform
  'env1',     -- Environment
  'fp1',      -- Foreign Policy
  'gov1',     -- Government Reform
  'health1',  -- Healthcare
  'imm1',     -- Immigration
  'ip1',      -- Israel/Palestine
  'social1',  -- Social Issues
  'tech1'     -- Technology
);

UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 2 WHERE id IN (
  'ct3',      -- China/Taiwan
  'cj11',     -- Criminal Justice
  'dp12',     -- Domestic Policy
  'eco3',     -- Economy
  'edu12',    -- Education
  'erm3',     -- Electoral Reform
  'env3',     -- Environment
  'fp5',      -- Foreign Policy
  'gov2',     -- Government Reform
  'health2',  -- Healthcare
  'imm2',     -- Immigration
  'ip2',      -- Israel/Palestine
  'social2',  -- Social Issues
  'tech2'     -- Technology
);