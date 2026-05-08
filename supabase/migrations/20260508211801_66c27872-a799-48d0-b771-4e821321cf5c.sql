
-- 1. Restrict storage 'official-photos' bucket writes to admins only
DROP POLICY IF EXISTS "Authenticated write official-photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update official-photos" ON storage.objects;

CREATE POLICY "Admins can insert official-photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'official-photos' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update official-photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'official-photos' AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'official-photos' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete official-photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'official-photos' AND public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Drop unused PII columns from static_officials (currently all NULL)
ALTER TABLE public.static_officials DROP COLUMN IF EXISTS email;
ALTER TABLE public.static_officials DROP COLUMN IF EXISTS phone;

-- 3. Tighten candidate_answers RLS for claimed politicians: allow only UPDATE of non-score fields
DROP POLICY IF EXISTS "Politicians can manage their claimed candidate answers" ON public.candidate_answers;

CREATE POLICY "Politicians can update evidence on their claimed answers"
ON public.candidate_answers FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_answers.candidate_id AND c.claimed_by_user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_answers.candidate_id AND c.claimed_by_user_id = auth.uid()));

-- Prevent claimed politicians from changing answer_value or confidence via trigger
CREATE OR REPLACE FUNCTION public.prevent_politician_score_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow admins and service role unrestricted updates
  IF public.has_role(auth.uid(), 'admin'::app_role) OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- For everyone else (claimed politicians), block changes to score-affecting fields
  IF NEW.answer_value IS DISTINCT FROM OLD.answer_value
     OR NEW.confidence IS DISTINCT FROM OLD.confidence
     OR NEW.evidence_type IS DISTINCT FROM OLD.evidence_type
     OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
     OR NEW.question_id IS DISTINCT FROM OLD.question_id THEN
    RAISE EXCEPTION 'Politicians cannot modify answer scores; contact an admin to update positions.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_politician_score_tampering_trigger ON public.candidate_answers;
CREATE TRIGGER prevent_politician_score_tampering_trigger
BEFORE UPDATE ON public.candidate_answers
FOR EACH ROW EXECUTE FUNCTION public.prevent_politician_score_tampering();
