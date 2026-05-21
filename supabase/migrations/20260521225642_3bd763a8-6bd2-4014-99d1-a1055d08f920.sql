
-- IE import sessions
CREATE TABLE public.ie_import_sessions (
  id text PRIMARY KEY,
  cycle text NOT NULL,
  filename text,
  row_count integer NOT NULL DEFAULT 0,
  inserted_rows integer NOT NULL DEFAULT 0,
  updated_rows integer NOT NULL DEFAULT 0,
  detected_cycle text,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  undone_at timestamptz,
  undo_summary jsonb,
  created_by uuid
);

ALTER TABLE public.ie_import_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select ie import sessions"
  ON public.ie_import_sessions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert ie import sessions"
  ON public.ie_import_sessions FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update ie import sessions"
  ON public.ie_import_sessions FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Track session on individual expenditures
ALTER TABLE public.independent_expenditures
  ADD COLUMN IF NOT EXISTS import_session_id text;

CREATE INDEX IF NOT EXISTS idx_independent_expenditures_import_session
  ON public.independent_expenditures(import_session_id);

-- Undo function
CREATE OR REPLACE FUNCTION public.undo_ie_import(p_session_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session public.ie_import_sessions%ROWTYPE;
  v_deleted int := 0;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  SELECT * INTO v_session FROM public.ie_import_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;
  IF v_session.status = 'undone' THEN
    RAISE EXCEPTION 'Session already undone';
  END IF;

  DELETE FROM public.independent_expenditures
   WHERE import_session_id = p_session_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  UPDATE public.ie_import_sessions
     SET status = 'undone',
         undone_at = now(),
         undo_summary = jsonb_build_object(
           'deleted_rows', v_deleted,
           'undone_by', auth.uid()
         )
   WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_rows', v_deleted,
    'cycle', v_session.cycle
  );
END;
$$;
