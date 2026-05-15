DELETE FROM public.candidate_answers
WHERE evidence_type = 'inferred'
  AND source_type = 'other'
  AND source_description IN (
    'Unable to determine position',
    'Unable to infer position',
    'Unable to research position',
    'Error inferring position',
    'Error during research'
  )
  AND source_url IS NULL
  AND COALESCE(array_length(source_urls, 1), 0) = 0;