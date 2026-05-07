
CREATE OR REPLACE FUNCTION public.calculate_coverage_tier(p_candidate_id text)
 RETURNS TABLE(coverage_tier coverage_tier, confidence confidence_level)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_answer_count int;
  v_total_questions int;
  v_vote_count int;
  v_donor_count int;
  v_answer_pct numeric;
  v_office text;
  v_is_local boolean := false;
BEGIN
  -- Determine office from candidates or candidate_overrides
  SELECT c.office INTO v_office FROM candidates c WHERE c.id = p_candidate_id;
  IF v_office IS NULL THEN
    SELECT co.office INTO v_office FROM candidate_overrides co WHERE co.candidate_id = p_candidate_id LIMIT 1;
  END IF;

  -- Determine if local official
  IF v_office IS NOT NULL AND (
    lower(v_office) LIKE '%governor%' OR lower(v_office) LIKE '%state senator%' OR
    lower(v_office) LIKE '%state rep%' OR lower(v_office) LIKE '%mayor%' OR
    lower(v_office) LIKE '%city council%' OR lower(v_office) LIKE '%county%' OR
    lower(v_office) LIKE '%alderman%' OR lower(v_office) LIKE '%selectman%' OR
    lower(v_office) LIKE '%town council%' OR lower(v_office) LIKE '%school board%' OR
    lower(v_office) LIKE '%sheriff%' OR lower(v_office) LIKE '%district attorney%' OR
    lower(v_office) LIKE '%municipal%' OR lower(v_office) LIKE '%attorney general%' OR
    lower(v_office) LIKE '%secretary of state%' OR lower(v_office) LIKE '%treasurer%' OR
    lower(v_office) LIKE '%auditor%' OR lower(v_office) LIKE '%comptroller%'
  ) THEN
    v_is_local := true;
  END IF;

  -- Get total questions for the appropriate scope
  IF v_is_local THEN
    SELECT COUNT(*) INTO v_total_questions FROM questions q
    JOIN topics t ON q.topic_id = t.id WHERE t.scope = 'local';
  ELSE
    SELECT COUNT(*) INTO v_total_questions FROM questions q
    JOIN topics t ON q.topic_id = t.id WHERE t.scope = 'all';
  END IF;
  
  -- Get answer count for this candidate
  SELECT COUNT(*) INTO v_answer_count 
  FROM candidate_answers 
  WHERE candidate_id = p_candidate_id;
  
  -- Get vote count
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
  
  IF v_answer_pct >= 80 AND (v_vote_count > 0 OR v_donor_count > 0) THEN
    coverage_tier := 'tier_1';
  ELSIF v_answer_pct >= 30 OR v_vote_count > 0 OR v_donor_count > 0 THEN
    coverage_tier := 'tier_2';
  ELSE
    coverage_tier := 'tier_3';
  END IF;
  
  IF v_answer_pct >= 80 AND v_vote_count > 0 THEN
    confidence := 'high';
  ELSIF v_answer_pct >= 30 THEN
    confidence := 'medium';
  ELSE
    confidence := 'low';
  END IF;
  
  RETURN NEXT;
END;
$function$;
