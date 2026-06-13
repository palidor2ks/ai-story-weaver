-- RLS / grant lock-down for a batch of tables. As originally authored these
-- were bare ALTER/REVOKE/GRANT/CREATE POLICY statements, but several targets
-- (the underscore-prefixed evidence-index staging tables, plus job_queue and
-- others) are created ad-hoc rather than by a migration, so a from-scratch
-- replay (e.g. a Supabase preview branch) does not have them and the statement
-- errors with 42P01 — blocking the Migrations check on every PR.
--
-- Every statement is now guarded on table existence (to_regclass): the
-- lock-down runs where the table exists and is skipped cleanly where it does
-- not. Mirrors the "skip cleanly on missing schema" pattern in
-- 20260612120000_conduit_memox_donor_backfill_and_earmark_rollups.sql.
-- Replay-safe: DROP POLICY IF EXISTS before each CREATE so a re-run is a no-op.
-- Prod already recorded this migration as applied, so this body change only
-- affects fresh replays; the live lock-down it produced is unchanged.
do $lockdown$
declare
  t text;
  pol text;
begin
  -- Evidence-index staging tables: enable RLS, lock to service_role, admin read.
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

  -- candidate_merge_map: admin read + admin write.
  if to_regclass('public.candidate_merge_map') is not null then
    drop policy if exists "admins read candidate_merge_map" on public.candidate_merge_map;
    create policy "admins read candidate_merge_map" on public.candidate_merge_map
      for select to authenticated using (public.has_role(auth.uid(), 'admin'));
    drop policy if exists "admins write candidate_merge_map" on public.candidate_merge_map;
    create policy "admins write candidate_merge_map" on public.candidate_merge_map
      for all to authenticated using (public.has_role(auth.uid(), 'admin'))
      with check (public.has_role(auth.uid(), 'admin'));
  else
    raise notice 'lockdown skipped: table public.candidate_merge_map does not exist on this database';
  end if;

  -- donor_card_causes: admin read.
  if to_regclass('public.donor_card_causes') is not null then
    drop policy if exists "admins read donor_card_causes" on public.donor_card_causes;
    create policy "admins read donor_card_causes" on public.donor_card_causes
      for select to authenticated using (public.has_role(auth.uid(), 'admin'));
  else
    raise notice 'lockdown skipped: table public.donor_card_causes does not exist on this database';
  end if;

  -- State sync-run tables: admin read.
  foreach t in array array['fl_sync_runs', 'nj_elec_sync_runs', 'ny_sync_runs'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'lockdown skipped: table public.% does not exist on this database', t;
      continue;
    end if;
    pol := 'admins read ' || t;
    execute format('drop policy if exists %I on public.%I', pol, t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.has_role(auth.uid(), ''admin''))',
      pol, t);
  end loop;

  -- job_queue: admin insert + admin delete.
  if to_regclass('public.job_queue') is not null then
    drop policy if exists "admins insert job_queue" on public.job_queue;
    create policy "admins insert job_queue" on public.job_queue
      for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
    drop policy if exists "admins delete job_queue" on public.job_queue;
    create policy "admins delete job_queue" on public.job_queue
      for delete to authenticated using (public.has_role(auth.uid(), 'admin'));
  else
    raise notice 'lockdown skipped: table public.job_queue does not exist on this database';
  end if;

  -- fec_candidates: drop anon's blanket SELECT, re-grant only public columns.
  if to_regclass('public.fec_candidates') is not null then
    revoke select on public.fec_candidates from anon;
    grant select (
      fec_candidate_id, cycle, name, party, election_year, office,
      office_state, office_district, incumbent_challenger, status,
      principal_committee_id, source, updated_at
    ) on public.fec_candidates to anon;
  else
    raise notice 'lockdown skipped: table public.fec_candidates does not exist on this database';
  end if;
end
$lockdown$;

DROP FUNCTION IF EXISTS public._mcp_ddl_test();
