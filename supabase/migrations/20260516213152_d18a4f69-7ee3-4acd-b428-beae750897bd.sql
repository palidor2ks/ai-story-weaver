
-- Donor import sessions tracking for cycle-mismatch guard + undo
CREATE TABLE IF NOT EXISTS public.donor_import_sessions (
  id text PRIMARY KEY,
  candidate_id text,
  committee_id text,
  cycle text NOT NULL,
  filename text,
  multi_committee boolean NOT NULL DEFAULT false,
  row_count integer NOT NULL DEFAULT 0,
  inserted_contributions integer NOT NULL DEFAULT 0,
  inserted_donors integer NOT NULL DEFAULT 0,
  detected_cycle text,
  status text NOT NULL DEFAULT 'running',
  started_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  undone_at timestamptz,
  undo_summary jsonb
);

CREATE INDEX IF NOT EXISTS donor_import_sessions_started_at_idx
  ON public.donor_import_sessions (started_at DESC);
CREATE INDEX IF NOT EXISTS donor_import_sessions_candidate_idx
  ON public.donor_import_sessions (candidate_id, cycle, started_at DESC);

ALTER TABLE public.donor_import_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage donor import sessions"
  ON public.donor_import_sessions FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages donor import sessions"
  ON public.donor_import_sessions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Tag rows written by an import for fast rollback
ALTER TABLE public.contributions
  ADD COLUMN IF NOT EXISTS import_session_id text;
ALTER TABLE public.donors
  ADD COLUMN IF NOT EXISTS import_session_id text;

CREATE INDEX IF NOT EXISTS contributions_import_session_idx
  ON public.contributions (import_session_id) WHERE import_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS donors_import_session_idx
  ON public.donors (import_session_id) WHERE import_session_id IS NOT NULL;

-- Admin-only undo RPC
CREATE OR REPLACE FUNCTION public.undo_donor_import(p_session_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.donor_import_sessions%ROWTYPE;
  v_deleted_contribs int := 0;
  v_deleted_donors int := 0;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  SELECT * INTO v_session FROM public.donor_import_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;
  IF v_session.status = 'undone' THEN
    RAISE EXCEPTION 'Session already undone';
  END IF;

  DELETE FROM public.contributions
   WHERE import_session_id = p_session_id;
  GET DIAGNOSTICS v_deleted_contribs = ROW_COUNT;

  -- Delete donor rows tagged with this session that have no remaining contributions
  DELETE FROM public.donors d
   WHERE d.import_session_id = p_session_id
     AND NOT EXISTS (
       SELECT 1 FROM public.contributions c
        WHERE c.recipient_committee_id = d.recipient_committee_id
          AND c.contributor_name = d.name
          AND c.cycle = d.cycle
     );
  GET DIAGNOSTICS v_deleted_donors = ROW_COUNT;

  UPDATE public.donor_import_sessions
     SET status = 'undone',
         undone_at = now(),
         undo_summary = jsonb_build_object(
           'deleted_contributions', v_deleted_contribs,
           'deleted_donors', v_deleted_donors,
           'undone_by', auth.uid()
         )
   WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_contributions', v_deleted_contribs,
    'deleted_donors', v_deleted_donors,
    'candidate_id', v_session.candidate_id,
    'cycle', v_session.cycle
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.undo_donor_import(text) TO authenticated;
