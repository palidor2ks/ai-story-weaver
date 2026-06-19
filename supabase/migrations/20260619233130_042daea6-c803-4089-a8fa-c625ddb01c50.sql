
DROP POLICY IF EXISTS fec_candidates_read ON public.fec_candidates;

CREATE OR REPLACE VIEW public.fec_candidates_public AS
SELECT fec_candidate_id, cycle, name, party, election_year, office,
       office_state, office_district, incumbent_challenger, status,
       principal_committee_id, state, source, updated_at
FROM public.fec_candidates;

GRANT SELECT ON public.fec_candidates_public TO anon, authenticated;

CREATE POLICY fec_candidates_admin_read ON public.fec_candidates
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

REVOKE SELECT ON public.fec_candidates FROM anon;

ALTER FUNCTION public.reconcile_vote_sync_status() SET search_path = public;
