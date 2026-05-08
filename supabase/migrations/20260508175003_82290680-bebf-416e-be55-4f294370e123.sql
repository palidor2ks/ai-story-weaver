DELETE FROM public.candidate_answers ca
USING public.questions q, public.topics t, public.static_officials s
WHERE ca.question_id = q.id
  AND q.topic_id = t.id
  AND ca.candidate_id = s.id
  AND s.level = 'local'
  AND t.scope = 'all';