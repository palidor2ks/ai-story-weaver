-- Create RPC function for atomic topic saving
CREATE OR REPLACE FUNCTION public.save_user_topics(
  p_user_id UUID,
  p_topics JSONB -- Array of {topic_id, weight}
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
$$;