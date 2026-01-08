-- Mark first 2 questions of each topic as canonical onboarding questions
UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 1 WHERE id IN (
  'environment-q1', 'defense-q1', 'civil-rights-q1', 'economy-q1', 'government-q1',
  'education-q1', 'healthcare-q1', 'immigration-q1', 'social-programs-q1', 'technology-q1'
);

UPDATE questions SET is_onboarding_canonical = true, onboarding_slot = 2 WHERE id IN (
  'environment-q2', 'defense-q2', 'civil-rights-q2', 'economy-q2', 'government-q2',
  'education-q2', 'healthcare-q2', 'immigration-q2', 'social-programs-q2', 'technology-q2'
);