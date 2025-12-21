-- Mark remaining topics as onboarding canonical using correct IDs
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 1 WHERE id IN (
  'cj10',     -- Criminal Justice
  'ct2',      -- China/Taiwan
  'dp10',     -- Domestic Policy
  'edu10',    -- Education
  'social1',  -- Social Issues
  'imm1'      -- Immigration
);

-- Check for civil-rights topic
SELECT id, topic_id FROM questions WHERE topic_id = 'civil-rights' LIMIT 1;