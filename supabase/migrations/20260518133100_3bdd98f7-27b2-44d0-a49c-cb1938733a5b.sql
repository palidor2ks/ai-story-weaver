CREATE OR REPLACE FUNCTION public.submit_poll_response(
  p_poll_id uuid,
  p_anon_session_id text,
  p_referrer text,
  p_user_agent text,
  p_answers jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_poll polls%ROWTYPE;
  v_response_id uuid;
  v_anon text;
BEGIN
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' OR jsonb_array_length(p_answers) = 0 THEN
    RAISE EXCEPTION 'Answers required';
  END IF;

  SELECT * INTO v_poll FROM polls WHERE id = p_poll_id;
  IF NOT FOUND OR v_poll.status <> 'published' THEN
    RAISE EXCEPTION 'Poll not available';
  END IF;

  -- Validate all question_ids belong to this poll
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_answers) a
    WHERE NOT EXISTS (
      SELECT 1 FROM poll_questions pq
      WHERE pq.poll_id = p_poll_id
        AND pq.question_id = (a->>'question_id')
    )
  ) THEN
    RAISE EXCEPTION 'Invalid question in answers';
  END IF;

  v_anon := CASE WHEN v_user IS NULL THEN NULLIF(p_anon_session_id, '') ELSE NULL END;
  IF v_user IS NULL AND (v_anon IS NULL OR length(v_anon) < 8) THEN
    RAISE EXCEPTION 'Anonymous session id required';
  END IF;

  INSERT INTO poll_responses (poll_id, anon_session_id, user_id, referrer, user_agent)
  VALUES (p_poll_id, v_anon, v_user, left(coalesce(p_referrer, ''), 500), left(coalesce(p_user_agent, ''), 200))
  RETURNING id INTO v_response_id;

  INSERT INTO poll_response_answers (response_id, question_id, selected_option_id, value)
  SELECT v_response_id,
         (a->>'question_id')::text,
         (a->>'selected_option_id')::text,
         COALESCE((a->>'value')::numeric, 0)
  FROM jsonb_array_elements(p_answers) a;

  IF v_user IS NOT NULL AND v_poll.type IN ('scored','mini_quiz') THEN
    INSERT INTO quiz_answers (user_id, question_id, selected_option_id, value)
    SELECT v_user,
           (a->>'question_id')::text,
           (a->>'selected_option_id')::text,
           COALESCE((a->>'value')::integer, 0)
    FROM jsonb_array_elements(p_answers) a
    ON CONFLICT (user_id, question_id) DO UPDATE
      SET selected_option_id = EXCLUDED.selected_option_id,
          value = EXCLUDED.value;
  END IF;

  RETURN v_response_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_poll_response(uuid, text, text, text, jsonb) TO anon, authenticated;