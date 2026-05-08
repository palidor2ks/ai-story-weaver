
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 1 WHERE id IN ('local-edu-1', 'local-housing-1', 'local-health-1', 'local-col-1', 'local-safety-1');

UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 2 WHERE id IN ('local-edu-5', 'local-housing-3', 'local-health-7', 'local-col-4', 'local-safety-5');
