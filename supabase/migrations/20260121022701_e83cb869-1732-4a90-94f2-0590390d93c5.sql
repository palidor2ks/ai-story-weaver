-- Fix #3: Restrict contributions table to authenticated users only
DROP POLICY IF EXISTS "Contributions are viewable by everyone" ON public.contributions;

CREATE POLICY "Authenticated users can view contributions"
  ON public.contributions FOR SELECT
  TO authenticated
  USING (true);

-- Fix #4: Add user validation to SECURITY DEFINER functions

-- Fix save_quiz_results function
CREATE OR REPLACE FUNCTION public.save_quiz_results(p_user_id uuid, p_overall_score numeric, p_topic_scores jsonb, p_answers jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- CRITICAL: Validate user can only modify their own data
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Cannot modify another user''s data';
  END IF;

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
$function$;

-- Fix save_user_topics function
CREATE OR REPLACE FUNCTION public.save_user_topics(p_user_id uuid, p_topics jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- CRITICAL: Validate user can only modify their own data
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Cannot modify another user''s data';
  END IF;

  -- Delete existing topics for this user
  DELETE FROM user_topics WHERE user_id = p_user_id;
  
  -- Insert new topics if provided
  IF p_topics IS NOT NULL AND jsonb_array_length(p_topics) > 0 THEN
    INSERT INTO user_topics (user_id, topic_id, weight)
    SELECT 
      p_user_id,
      (topic->>'topic_id')::text,
      (topic->>'weight')::integer
    FROM jsonb_array_elements(p_topics) AS topic;
  END IF;
END;
$function$;