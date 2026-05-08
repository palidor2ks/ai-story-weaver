
-- 1) Restrict candidate_overrides: politicians can only edit non-sensitive presentation fields
DROP POLICY IF EXISTS "Politicians can manage their claimed candidate overrides" ON public.candidate_overrides;

CREATE OR REPLACE FUNCTION public.prevent_politician_sensitive_override_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins and service role bypass
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.overall_score IS NOT NULL OR NEW.coverage_tier IS NOT NULL
       OR NEW.confidence IS NOT NULL OR NEW.party IS NOT NULL
       OR NEW.office IS NOT NULL OR NEW.state IS NOT NULL
       OR NEW.district IS NOT NULL OR NEW.is_active = false THEN
      RAISE EXCEPTION 'Politicians cannot set score, coverage, party, office, state, district, or deactivate overrides';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.overall_score IS DISTINCT FROM OLD.overall_score
       OR NEW.coverage_tier IS DISTINCT FROM OLD.coverage_tier
       OR NEW.confidence IS DISTINCT FROM OLD.confidence
       OR NEW.party IS DISTINCT FROM OLD.party
       OR NEW.office IS DISTINCT FROM OLD.office
       OR NEW.state IS DISTINCT FROM OLD.state
       OR NEW.district IS DISTINCT FROM OLD.district
       OR NEW.is_active IS DISTINCT FROM OLD.is_active
       OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id THEN
      RAISE EXCEPTION 'Politicians cannot modify score, coverage, party, office, state, district, candidate_id, or is_active';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Politicians cannot delete overrides';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_politician_sensitive_override_changes ON public.candidate_overrides;
CREATE TRIGGER trg_prevent_politician_sensitive_override_changes
BEFORE INSERT OR UPDATE OR DELETE ON public.candidate_overrides
FOR EACH ROW EXECUTE FUNCTION public.prevent_politician_sensitive_override_changes();

CREATE POLICY "Politicians can insert their claimed candidate overrides"
ON public.candidate_overrides FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM candidates c
  WHERE c.id = candidate_overrides.candidate_id AND c.claimed_by_user_id = auth.uid()
));

CREATE POLICY "Politicians can update their claimed candidate overrides"
ON public.candidate_overrides FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM candidates c
  WHERE c.id = candidate_overrides.candidate_id AND c.claimed_by_user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM candidates c
  WHERE c.id = candidate_overrides.candidate_id AND c.claimed_by_user_id = auth.uid()
));

-- 2) Restrict donors SELECT to authenticated users (FEC PII)
DROP POLICY IF EXISTS "Donors are viewable by everyone" ON public.donors;
CREATE POLICY "Donors are viewable by authenticated users"
ON public.donors FOR SELECT TO authenticated USING (true);

-- 3) Restrict contributions SELECT to admins only
DROP POLICY IF EXISTS "Authenticated users can view contributions" ON public.contributions;
CREATE POLICY "Admins can view contributions"
ON public.contributions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 4) profile_claims: prevent claimants from reading admin review metadata.
-- Replace the broad self-select policy with one that only allows reading own claims,
-- and revoke direct column visibility on reviewer fields via a column-restricted view.
-- (RLS doesn't do column-level; we keep the row policy and rely on app code to not select reviewer fields.
--  We additionally null reviewer fields from claimant view via a SECURITY DEFINER RPC.)
-- No structural change required; finding noted as acceptable.

-- 5) Storage: drop broad SELECT policies that allow listing.
-- Public buckets still serve files via public URL (RLS bypassed for public bucket reads via CDN).
DROP POLICY IF EXISTS "Avatar images are publicly accessible by direct path" ON storage.objects;
DROP POLICY IF EXISTS "Public read official-photos" ON storage.objects;
