
-- 1) Restrict public read of share_cards. Page is served by edge function (service role).
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT polname FROM pg_policy WHERE polrelid='public.share_cards'::regclass AND polcmd IN ('r','*') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.share_cards', p.polname);
  END LOOP;
END $$;

-- Only owners can read their own share cards directly; edge functions use service_role and bypass RLS.
CREATE POLICY "Owners can read their own share cards"
  ON public.share_cards
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 2) Prevent politicians from tampering with score-affecting fields on candidate_answers
CREATE OR REPLACE FUNCTION public.prevent_politician_candidate_answer_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.answer_value     IS DISTINCT FROM OLD.answer_value
     OR NEW.confidence      IS DISTINCT FROM OLD.confidence
     OR NEW.source_type     IS DISTINCT FROM OLD.source_type
     OR NEW.has_discrepancy IS DISTINCT FROM OLD.has_discrepancy
     OR NEW.discrepancy_note IS DISTINCT FROM OLD.discrepancy_note
     OR NEW.candidate_id    IS DISTINCT FROM OLD.candidate_id
     OR NEW.question_id     IS DISTINCT FROM OLD.question_id
     OR NEW.answer_value    IS DISTINCT FROM OLD.answer_value
     OR NEW.evidence_type   IS DISTINCT FROM OLD.evidence_type THEN
    RAISE EXCEPTION 'Politicians cannot modify scoring or discrepancy fields on candidate_answers; only evidence/source descriptions are editable. Contact an admin.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_politician_candidate_answer_tampering ON public.candidate_answers;
CREATE TRIGGER trg_prevent_politician_candidate_answer_tampering
  BEFORE UPDATE ON public.candidate_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_politician_candidate_answer_tampering();
