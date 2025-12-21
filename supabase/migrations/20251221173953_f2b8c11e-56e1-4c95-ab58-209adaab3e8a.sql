-- Fix security definer view by dropping and recreating with SECURITY INVOKER
DROP VIEW IF EXISTS public.calculated_candidate_topic_scores;

CREATE OR REPLACE VIEW public.calculated_candidate_topic_scores 
WITH (security_invoker = true) AS
SELECT 
  ca.candidate_id,
  q.topic_id,
  AVG(ca.answer_value) as calculated_score,
  COUNT(ca.id) as answer_count
FROM public.candidate_answers ca
JOIN public.questions q ON ca.question_id = q.id
GROUP BY ca.candidate_id, q.topic_id;