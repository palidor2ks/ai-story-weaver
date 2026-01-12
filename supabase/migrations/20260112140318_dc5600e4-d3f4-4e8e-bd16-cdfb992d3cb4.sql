
-- Drop and recreate the calculate_coverage_tier function with correct table name
DROP FUNCTION IF EXISTS public.calculate_coverage_tier(text);

CREATE FUNCTION public.calculate_coverage_tier(p_candidate_id text)
RETURNS TABLE(coverage_tier coverage_tier, confidence confidence_level)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_answer_count int;
  v_total_questions int;
  v_vote_count int;
  v_donor_count int;
  v_answer_pct numeric;
BEGIN
  -- Get total questions
  SELECT COUNT(*) INTO v_total_questions FROM questions;
  
  -- Get answer count for this candidate
  SELECT COUNT(*) INTO v_answer_count 
  FROM candidate_answers 
  WHERE candidate_id = p_candidate_id;
  
  -- Get vote count (voting records) - FIXED: use candidate_votes instead of votes
  SELECT COUNT(*) INTO v_vote_count 
  FROM candidate_votes 
  WHERE candidate_id = p_candidate_id;
  
  -- Get donor count
  SELECT COUNT(*) INTO v_donor_count 
  FROM donors 
  WHERE candidate_id = p_candidate_id;
  
  -- Calculate answer percentage
  IF v_total_questions > 0 THEN
    v_answer_pct := (v_answer_count::numeric / v_total_questions) * 100;
  ELSE
    v_answer_pct := 0;
  END IF;
  
  -- Determine coverage tier based on data availability
  -- tier_1 (Full): >= 80% answers AND (has votes OR has donors)
  -- tier_2 (Partial): >= 30% answers OR has votes OR has donors
  -- tier_3 (Basic): everything else
  IF v_answer_pct >= 80 AND (v_vote_count > 0 OR v_donor_count > 0) THEN
    coverage_tier := 'tier_1';
  ELSIF v_answer_pct >= 30 OR v_vote_count > 0 OR v_donor_count > 0 THEN
    coverage_tier := 'tier_2';
  ELSE
    coverage_tier := 'tier_3';
  END IF;
  
  -- Determine confidence based on data quality
  -- high: >= 80% answers with votes or donors
  -- medium: >= 30% answers
  -- low: < 30% answers
  IF v_answer_pct >= 80 AND v_vote_count > 0 THEN
    confidence := 'high';
  ELSIF v_answer_pct >= 30 THEN
    confidence := 'medium';
  ELSE
    confidence := 'low';
  END IF;
  
  RETURN NEXT;
END;
$$;

-- Also fix the auto_recalculate_coverage_tier trigger function
CREATE OR REPLACE FUNCTION public.auto_recalculate_coverage_tier()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_candidate_id text;
BEGIN
  -- Determine which candidate_id to update based on the table
  IF TG_TABLE_NAME = 'candidate_answers' THEN
    v_candidate_id := COALESCE(NEW.candidate_id, OLD.candidate_id);
  ELSIF TG_TABLE_NAME = 'candidate_votes' THEN
    v_candidate_id := COALESCE(NEW.candidate_id, OLD.candidate_id);
  ELSIF TG_TABLE_NAME = 'donors' THEN
    v_candidate_id := COALESCE(NEW.candidate_id, OLD.candidate_id);
  END IF;
  
  -- Skip if no candidate_id
  IF v_candidate_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Recalculate coverage tier for this candidate
  PERFORM recalculate_candidate_coverage(v_candidate_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;
