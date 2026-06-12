
ALTER TABLE public._enrich_stmt_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._evidence_spike_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._evidence_spike_statements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public._enrich_stmt_staging FROM anon, authenticated;
REVOKE ALL ON public._evidence_spike_log FROM anon, authenticated;
REVOKE ALL ON public._evidence_spike_statements FROM anon, authenticated;
GRANT ALL ON public._enrich_stmt_staging TO service_role;
GRANT ALL ON public._evidence_spike_log TO service_role;
GRANT ALL ON public._evidence_spike_statements TO service_role;

CREATE POLICY "admins read enrich staging" ON public._enrich_stmt_staging
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins read evidence spike log" ON public._evidence_spike_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins read evidence spike statements" ON public._evidence_spike_statements
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins read candidate_merge_map" ON public.candidate_merge_map
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins write candidate_merge_map" ON public.candidate_merge_map
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins read donor_card_causes" ON public.donor_card_causes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins read fl_sync_runs" ON public.fl_sync_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins read nj_elec_sync_runs" ON public.nj_elec_sync_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins read ny_sync_runs" ON public.ny_sync_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins insert job_queue" ON public.job_queue
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete job_queue" ON public.job_queue
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

REVOKE SELECT ON public.fec_candidates FROM anon;
GRANT SELECT (
  fec_candidate_id, cycle, name, party, election_year, office,
  office_state, office_district, incumbent_challenger, status,
  principal_committee_id, source, updated_at
) ON public.fec_candidates TO anon;

DROP FUNCTION IF EXISTS public._mcp_ddl_test();
