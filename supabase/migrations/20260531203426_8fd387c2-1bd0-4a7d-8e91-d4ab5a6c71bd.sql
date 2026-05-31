-- 1. Replace save_quiz_results so overall_score is recomputed server-side
--    from user_topic_scores × user_topics.weight after upserts.
CREATE OR REPLACE FUNCTION public.save_quiz_results(
  p_user_id uuid,
  p_overall_score numeric,
  p_topic_scores jsonb,
  p_answers jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_overall numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Cannot modify another user''s data';
  END IF;

  -- Upsert topic scores from this session
  INSERT INTO user_topic_scores (user_id, topic_id, score, updated_at)
  SELECT
    p_user_id,
    (ts->>'topicId')::text,
    (ts->>'score')::numeric,
    NOW()
  FROM jsonb_array_elements(p_topic_scores) AS ts
  ON CONFLICT (user_id, topic_id)
  DO UPDATE SET score = EXCLUDED.score, updated_at = NOW();

  -- Upsert quiz answers from this session
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

  -- Recompute overall_score from ALL stored topic scores weighted by user_topics.
  -- Falls back to simple average if user has no topic weights. Falls back to
  -- client-provided value as last resort if no topic scores exist yet.
  SELECT
    CASE
      WHEN SUM(COALESCE(ut.weight, 1)) > 0
        THEN ROUND((SUM(uts.score * COALESCE(ut.weight, 1)) / SUM(COALESCE(ut.weight, 1)))::numeric, 2)
      ELSE NULL
    END
  INTO v_overall
  FROM user_topic_scores uts
  LEFT JOIN user_topics ut
    ON ut.user_id = uts.user_id AND ut.topic_id = uts.topic_id
  WHERE uts.user_id = p_user_id;

  UPDATE profiles
  SET overall_score = COALESCE(v_overall, p_overall_score, 0),
      score_version = 'v1.1',
      updated_at = NOW()
  WHERE id = p_user_id;
END;
$function$;

-- 2. Backfill: recompute overall_score for all users from their stored topic scores
UPDATE profiles p
SET overall_score = sub.overall,
    score_version = 'v1.1',
    updated_at = NOW()
FROM (
  SELECT
    uts.user_id,
    CASE
      WHEN SUM(COALESCE(ut.weight, 1)) > 0
        THEN ROUND((SUM(uts.score * COALESCE(ut.weight, 1)) / SUM(COALESCE(ut.weight, 1)))::numeric, 2)
      ELSE 0
    END AS overall
  FROM user_topic_scores uts
  LEFT JOIN user_topics ut
    ON ut.user_id = uts.user_id AND ut.topic_id = uts.topic_id
  GROUP BY uts.user_id
) sub
WHERE p.id = sub.user_id
  AND p.overall_score IS DISTINCT FROM sub.overall;