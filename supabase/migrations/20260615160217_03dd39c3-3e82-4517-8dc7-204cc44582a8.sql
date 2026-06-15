CREATE OR REPLACE FUNCTION public.refresh_candidate_topic_scores()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
DECLARE
  affected_candidate TEXT;
BEGIN
  affected_candidate := COALESCE(NEW.candidate_id, OLD.candidate_id);
  INSERT INTO public.candidate_topic_scores (candidate_id, topic_id, score)
  SELECT ca.candidate_id, q.topic_id, round(avg(ca.answer_value)::numeric, 2)
  FROM public.candidate_answers ca
  JOIN public.questions q ON q.id = ca.question_id
  WHERE ca.candidate_id = affected_candidate
  GROUP BY ca.candidate_id, q.topic_id
  ON CONFLICT (candidate_id, topic_id) DO UPDATE SET score = EXCLUDED.score;
  RETURN NULL;
END;
$function$;