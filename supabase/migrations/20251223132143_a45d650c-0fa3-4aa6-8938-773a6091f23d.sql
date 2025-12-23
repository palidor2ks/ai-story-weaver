-- Create trigger function to auto-recalculate coverage tier
CREATE OR REPLACE FUNCTION public.auto_recalculate_coverage_tier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate_id text;
BEGIN
  -- Determine which candidate_id to update based on the table
  IF TG_TABLE_NAME = 'candidate_answers' THEN
    v_candidate_id := COALESCE(NEW.candidate_id, OLD.candidate_id);
  ELSIF TG_TABLE_NAME = 'votes' THEN
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

-- Create triggers for candidate_answers table
DROP TRIGGER IF EXISTS trg_recalc_coverage_on_answer_insert ON candidate_answers;
CREATE TRIGGER trg_recalc_coverage_on_answer_insert
  AFTER INSERT ON candidate_answers
  FOR EACH ROW
  EXECUTE FUNCTION auto_recalculate_coverage_tier();

DROP TRIGGER IF EXISTS trg_recalc_coverage_on_answer_update ON candidate_answers;
CREATE TRIGGER trg_recalc_coverage_on_answer_update
  AFTER UPDATE ON candidate_answers
  FOR EACH ROW
  EXECUTE FUNCTION auto_recalculate_coverage_tier();

DROP TRIGGER IF EXISTS trg_recalc_coverage_on_answer_delete ON candidate_answers;
CREATE TRIGGER trg_recalc_coverage_on_answer_delete
  AFTER DELETE ON candidate_answers
  FOR EACH ROW
  EXECUTE FUNCTION auto_recalculate_coverage_tier();

-- Create triggers for votes table
DROP TRIGGER IF EXISTS trg_recalc_coverage_on_vote_insert ON votes;
CREATE TRIGGER trg_recalc_coverage_on_vote_insert
  AFTER INSERT ON votes
  FOR EACH ROW
  EXECUTE FUNCTION auto_recalculate_coverage_tier();

DROP TRIGGER IF EXISTS trg_recalc_coverage_on_vote_update ON votes;
CREATE TRIGGER trg_recalc_coverage_on_vote_update
  AFTER UPDATE ON votes
  FOR EACH ROW
  EXECUTE FUNCTION auto_recalculate_coverage_tier();

DROP TRIGGER IF EXISTS trg_recalc_coverage_on_vote_delete ON votes;
CREATE TRIGGER trg_recalc_coverage_on_vote_delete
  AFTER DELETE ON votes
  FOR EACH ROW
  EXECUTE FUNCTION auto_recalculate_coverage_tier();

-- Create triggers for donors table
DROP TRIGGER IF EXISTS trg_recalc_coverage_on_donor_insert ON donors;
CREATE TRIGGER trg_recalc_coverage_on_donor_insert
  AFTER INSERT ON donors
  FOR EACH ROW
  EXECUTE FUNCTION auto_recalculate_coverage_tier();

DROP TRIGGER IF EXISTS trg_recalc_coverage_on_donor_update ON donors;
CREATE TRIGGER trg_recalc_coverage_on_donor_update
  AFTER UPDATE ON donors
  FOR EACH ROW
  EXECUTE FUNCTION auto_recalculate_coverage_tier();

DROP TRIGGER IF EXISTS trg_recalc_coverage_on_donor_delete ON donors;
CREATE TRIGGER trg_recalc_coverage_on_donor_delete
  AFTER DELETE ON donors
  FOR EACH ROW
  EXECUTE FUNCTION auto_recalculate_coverage_tier();