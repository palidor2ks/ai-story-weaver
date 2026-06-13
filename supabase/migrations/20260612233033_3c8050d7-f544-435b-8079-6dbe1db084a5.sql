
-- These three underscore-prefixed staging tables are created ad-hoc by the
-- evidence-index tooling, not by any migration, so a from-scratch replay (e.g.
-- a Supabase preview branch) does not have them and the bare ALTER/GRANT/POLICY
-- statements error with 42P01. Guard each on table existence (to_regclass) so
-- the lock-down runs where the table exists and is skipped cleanly where it
-- does not — mirrors the "skip cleanly on missing schema" pattern in
-- 20260612120000_conduit_memox_donor_backfill_and_earmark_rollups.sql.
-- Replay-safe: DROP POLICY IF EXISTS before CREATE so a re-run is a no-op.
do $stage$
declare
  t text;
  pol text;
begin
  foreach t in array array['_enrich_stmt_staging', '_evidence_spike_log', '_evidence_spike_statements'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'lockdown skipped: table public.% does not exist on this database', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    pol := case t
      when '_enrich_stmt_staging' then 'admins read enrich staging'
      when '_evidence_spike_log' then 'admins read evidence spike log'
      else 'admins read evidence spike statements'
    end;
    execute format('drop policy if exists %I on public.%I', pol, t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.has_role(auth.uid(), ''admin''))',
      pol, t);
  end loop;
end
$stage$;

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
