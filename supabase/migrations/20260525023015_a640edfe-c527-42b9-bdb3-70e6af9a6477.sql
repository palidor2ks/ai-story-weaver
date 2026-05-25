
-- Clear all existing onboarding flags
UPDATE public.questions SET is_onboarding_canonical = false, onboarding_slot = NULL;

-- Federal topics (slot 1 + slot 2)
UPDATE public.questions SET is_onboarding_canonical = true, onboarding_slot = 1 WHERE id = 'economy-q15';
UPDATE public.questions SET is_onboarding_canonical = true, onboarding_slot = 2 WHERE id = 'economy-q18';

UPDATE public.questions SET is_onboarding_canonical = true, onboarding_slot = 1 WHERE id = 'healthcare-q11';
UPDATE public.questions SET is_onboarding_canonical = true, onboarding_slot = 2 WHERE id = 'healthcare-q14';

UPDATE public.questions SET is_onboarding_canonical = true, onboarding_slot = 1 WHERE id = 'environment-q9';
UPDATE public.questions SET is_onboarding_canonical = true, onboarding_slot = 2 WHERE id = 'environment-q8';

UPDATE public.questions SET is_onboarding_canonical = true, onboarding_slot = 1 WHERE id = 'immigration-q2';
UPDATE public.questions SET is_onboarding_canonical = true, onboarding_slot = 2 WHERE id = 'defense-q2';

UPDATE public.questions SET is_onboarding_canonical = true, onboarding_slot = 1 WHERE id = 'civil-rights-q22';
UPDATE public.questions SET is_onboarding_canonical = true, onboarding_slot = 2 WHERE id = 'civil-rights-q21';

UPDATE public.questions SET is_onboarding_canonical = true, onboarding_slot = 1 WHERE id = 'government-q21';
UPDATE public.questions SET is_onboarding_canonical = true, onboarding_slot = 2 WHERE id = 'government-q1';

-- Local topics
UPDATE public.questions SET is_onboarding_canonical = true, onboarding_slot = 1 WHERE id = 'local-col-1';
UPDATE public.questions SET is_onboarding_canonical = true, onboarding_slot = 2 WHERE id = 'local-col-6';

UPDATE public.questions SET is_onboarding_canonical = true, onboarding_slot = 1 WHERE id = 'local-edu-5';
UPDATE public.questions SET is_onboarding_canonical = true, onboarding_slot = 2 WHERE id = 'local-edu-3';

UPDATE public.questions SET is_onboarding_canonical = true, onboarding_slot = 1 WHERE id = 'local-housing-1';
UPDATE public.questions SET is_onboarding_canonical = true, onboarding_slot = 2 WHERE id = 'local-housing-2';

UPDATE public.questions SET is_onboarding_canonical = true, onboarding_slot = 1 WHERE id = 'local-health-3';
UPDATE public.questions SET is_onboarding_canonical = true, onboarding_slot = 2 WHERE id = 'local-health-2';

UPDATE public.questions SET is_onboarding_canonical = true, onboarding_slot = 1 WHERE id = 'local-safety-1';
UPDATE public.questions SET is_onboarding_canonical = true, onboarding_slot = 2 WHERE id = 'local-safety-19';
