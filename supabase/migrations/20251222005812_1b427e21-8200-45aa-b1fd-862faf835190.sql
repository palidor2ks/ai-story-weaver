-- Function to backfill candidate scores from candidate_answers
-- This ensures all candidates with answers have their overall_score calculated and saved

CREATE OR REPLACE FUNCTION public.backfill_candidate_scores()
RETURNS TABLE(updated_count integer, details text) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidates_updated integer := 0;
  overrides_updated integer := 0;
BEGIN
  -- Update candidates table for candidates with answers but missing/zero scores
  WITH calculated_scores AS (
    SELECT 
      candidate_id,
      ROUND(AVG(answer_value)::numeric, 2) as avg_score,
      COUNT(*) as answer_count
    FROM candidate_answers
    GROUP BY candidate_id
    HAVING COUNT(*) > 0
  )
  UPDATE candidates c
  SET 
    overall_score = cs.avg_score,
    answers_source = COALESCE(c.answers_source, 'calculated_from_answers'),
    last_answers_sync = NOW()
  FROM calculated_scores cs
  WHERE c.id = cs.candidate_id
    AND (c.overall_score IS NULL OR c.overall_score = 0);

  GET DIAGNOSTICS candidates_updated = ROW_COUNT;

  -- Insert/update candidate_overrides for candidates NOT in candidates table
  -- but who have answers in candidate_answers
  WITH calculated_scores AS (
    SELECT 
      ca.candidate_id,
      ROUND(AVG(ca.answer_value)::numeric, 2) as avg_score
    FROM candidate_answers ca
    LEFT JOIN candidates c ON c.id = ca.candidate_id
    WHERE c.id IS NULL
    GROUP BY ca.candidate_id
    HAVING COUNT(*) > 0
  )
  INSERT INTO candidate_overrides (candidate_id, overall_score, created_at, updated_at)
  SELECT 
    cs.candidate_id,
    cs.avg_score,
    NOW(),
    NOW()
  FROM calculated_scores cs
  ON CONFLICT (candidate_id) 
  DO UPDATE SET 
    overall_score = EXCLUDED.overall_score,
    updated_at = NOW()
  WHERE candidate_overrides.overall_score IS NULL 
     OR candidate_overrides.overall_score = 0;

  GET DIAGNOSTICS overrides_updated = ROW_COUNT;

  updated_count := candidates_updated + overrides_updated;
  details := format('Updated %s candidates, %s overrides', candidates_updated, overrides_updated);
  
  RETURN NEXT;
END;
$$;

-- Run the backfill immediately
SELECT * FROM backfill_candidate_scores();