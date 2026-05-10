INSERT INTO public.question_options
  (id, question_id, text, value, display_order, is_skip_option)
SELECT
  q.id || '-opt-skip',
  q.id,
  'Not important to me',
  0,
  6,
  true
FROM public.questions q
WHERE NOT EXISTS (
  SELECT 1
  FROM public.question_options o
  WHERE o.question_id = q.id
    AND o.is_skip_option = true
);