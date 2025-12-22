-- Create atomic save_quiz_results function
-- This replaces three separate writes with a single transaction
CREATE OR REPLACE FUNCTION public.save_quiz_results(
  p_user_id UUID,
  p_overall_score NUMERIC,
  p_topic_scores JSONB,
  p_answers JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Update profile with overall score
  UPDATE profiles 
  SET overall_score = p_overall_score, score_version = 'v1.0', updated_at = NOW()
  WHERE id = p_user_id;

  -- 2. Upsert topic scores
  INSERT INTO user_topic_scores (user_id, topic_id, score, updated_at)
  SELECT 
    p_user_id,
    (ts->>'topicId')::text,
    (ts->>'score')::numeric,
    NOW()
  FROM jsonb_array_elements(p_topic_scores) AS ts
  ON CONFLICT (user_id, topic_id) 
  DO UPDATE SET score = EXCLUDED.score, updated_at = NOW();

  -- 3. Upsert quiz answers
  INSERT INTO quiz_answers (user_id, question_id, selected_option_id, value, created_at)
  SELECT 
    p_user_id,
    (a->>'questionId')::text,
    (a->>'selectedOptionId')::text,
    (a->>'value')::integer,
    NOW()
  FROM jsonb_array_elements(p_answers) AS a
  ON CONFLICT (user_id, question_id) 
  DO UPDATE SET 
    selected_option_id = EXCLUDED.selected_option_id,
    value = EXCLUDED.value;
END;
$$;