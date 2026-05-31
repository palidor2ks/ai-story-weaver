-- Atomically increment donor import session counters from CSV import batches.
CREATE OR REPLACE FUNCTION public.increment_donor_import_session(
  p_session_id text,
  p_rows integer DEFAULT 0,
  p_inserted_contributions integer DEFAULT 0,
  p_inserted_donors integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.donor_import_sessions
     SET row_count = COALESCE(row_count, 0) + COALESCE(p_rows, 0),
         inserted_contributions = COALESCE(inserted_contributions, 0) + COALESCE(p_inserted_contributions, 0),
         inserted_donors = COALESCE(inserted_donors, 0) + COALESCE(p_inserted_donors, 0)
   WHERE id = p_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_donor_import_session(text, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_donor_import_session(text, integer, integer, integer) TO service_role;
