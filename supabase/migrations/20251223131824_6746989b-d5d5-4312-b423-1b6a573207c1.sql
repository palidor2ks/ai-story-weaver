-- Create function to calculate coverage tier based on actual data availability
CREATE OR REPLACE FUNCTION public.calculate_coverage_tier(
  p_candidate_id text
)
RETURNS TABLE(coverage_tier coverage_tier, confidence confidence_level) 
LANGUAGE plpgsql
SECURITY DEFINER
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
  
  -- Get vote count (voting records)
  SELECT COUNT(*) INTO v_vote_count 
  FROM votes 
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

-- Create function to recalculate and update coverage for all candidates
CREATE OR REPLACE FUNCTION public.recalculate_all_coverage_tiers()
RETURNS TABLE(updated_count integer, details text) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int := 0;
  v_candidate record;
  v_calc record;
BEGIN
  FOR v_candidate IN SELECT id FROM candidates
  LOOP
    SELECT * INTO v_calc FROM calculate_coverage_tier(v_candidate.id);
    
    UPDATE candidates
    SET 
      coverage_tier = v_calc.coverage_tier,
      confidence = v_calc.confidence,
      last_updated = NOW()
    WHERE id = v_candidate.id
      AND (coverage_tier IS DISTINCT FROM v_calc.coverage_tier 
           OR confidence IS DISTINCT FROM v_calc.confidence);
    
    IF FOUND THEN
      v_updated := v_updated + 1;
    END IF;
  END LOOP;
  
  updated_count := v_updated;
  details := format('Recalculated coverage for all candidates. Updated %s records.', v_updated);
  RETURN NEXT;
END;
$$;

-- Create function to recalculate coverage for a single candidate
CREATE OR REPLACE FUNCTION public.recalculate_candidate_coverage(p_candidate_id text)
RETURNS TABLE(coverage_tier coverage_tier, confidence confidence_level, updated boolean) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_calc record;
  v_updated boolean := false;
BEGIN
  SELECT * INTO v_calc FROM calculate_coverage_tier(p_candidate_id);
  
  UPDATE candidates
  SET 
    coverage_tier = v_calc.coverage_tier,
    confidence = v_calc.confidence,
    last_updated = NOW()
  WHERE id = p_candidate_id
    AND (candidates.coverage_tier IS DISTINCT FROM v_calc.coverage_tier 
         OR candidates.confidence IS DISTINCT FROM v_calc.confidence);
  
  v_updated := FOUND;
  
  coverage_tier := v_calc.coverage_tier;
  confidence := v_calc.confidence;
  updated := v_updated;
  RETURN NEXT;
END;
$$;