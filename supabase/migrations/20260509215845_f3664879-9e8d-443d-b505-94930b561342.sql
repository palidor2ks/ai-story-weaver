
CREATE OR REPLACE FUNCTION public.prevent_candidate_override_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
BEGIN
  -- Service role and admins bypass all checks
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  is_admin := has_role(auth.uid(), 'admin'::app_role);
  IF is_admin THEN
    RETURN NEW;
  END IF;

  -- Non-admin path: enforce that sensitive scoring/audit fields cannot be set
  IF TG_OP = 'INSERT' THEN
    IF NEW.overall_score IS NOT NULL
       OR NEW.coverage_tier IS NOT NULL
       OR NEW.confidence IS NOT NULL
       OR NEW.created_by IS NOT NULL
       OR NEW.updated_by IS NOT NULL THEN
      RAISE EXCEPTION 'Non-admin users cannot set overall_score, coverage_tier, confidence, created_by, or updated_by on candidate_overrides';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.overall_score IS DISTINCT FROM OLD.overall_score
       OR NEW.coverage_tier IS DISTINCT FROM OLD.coverage_tier
       OR NEW.confidence IS DISTINCT FROM OLD.confidence
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.updated_by IS DISTINCT FROM OLD.updated_by THEN
      RAISE EXCEPTION 'Non-admin users cannot modify overall_score, coverage_tier, confidence, created_by, or updated_by on candidate_overrides';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_candidate_override_tampering_trg ON public.candidate_overrides;
CREATE TRIGGER prevent_candidate_override_tampering_trg
  BEFORE INSERT OR UPDATE ON public.candidate_overrides
  FOR EACH ROW EXECUTE FUNCTION public.prevent_candidate_override_tampering();
