-- 1. Update the Governor override with prior offices and image
UPDATE public.candidate_overrides
SET 
  prior_offices = '[{"office": "Representative", "state": "NJ", "district": "11", "start_year": 2019, "end_year": 2025, "candidate_id": "S001207"}]'::jsonb,
  image_url = COALESCE(image_url, (SELECT image_url FROM public.candidates WHERE id = 'S001207')),
  updated_at = NOW()
WHERE candidate_id = 'nj_governor_sherrill';

-- 2. Re-key candidate_answers from old federal ID to new civic ID
UPDATE public.candidate_answers
SET candidate_id = 'nj_governor_sherrill'
WHERE candidate_id = 'S001207'
  AND question_id NOT IN (
    SELECT question_id FROM public.candidate_answers WHERE candidate_id = 'nj_governor_sherrill'
  );

-- 3. Mark old federal record as no longer incumbent
UPDATE public.candidates
SET is_incumbent = false, last_updated = NOW()
WHERE id = 'S001207';