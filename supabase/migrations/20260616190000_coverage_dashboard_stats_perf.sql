-- Perf fix: make get_coverage_dashboard_stats() complete under the authenticated role's 8s
-- statement_timeout, so the dashboard actually receives visible-states numbers instead of silently
-- falling back to the global admin_stats_cache.
--
-- Symptom: after 20260616120000 / 20260616180000 the dashboard still showed all-state numbers. The
-- function ran fine from the service connection but the browser (role `authenticated`, capped at
-- statement_timeout = 8s) hit "canceling statement due to statement timeout", the hook threw, and
-- the UI fell back to the global cache.
--
-- Cause (EXPLAIN ANALYZE): joining the big tables to a `visible_cand` CTE produced a bad planner
-- estimate (~1196 rows vs the real 172) from the `... not in (get_hidden_state_codes())` filter, so
-- it SEQ-SCANNED all ~1.9M candidate_votes (hash join) and force-aggregated the 601k-row
-- candidate_answer_coverage_stats VIEW before filtering. A per-function statement_timeout does NOT
-- help — Postgres arms statement_timeout when the outer `select … from func()` begins (under 8s) and
-- a mid-statement GUC change doesn't rearm it.
--
-- Fix: resolve the ~172 visible candidate ids into an array ONCE, then filter every big table with
-- `candidate_id = any(v_ids)`. A constant array drives index scans (idx_candidate_votes_candidate,
-- idx_candidate_answers_candidate_id, finance_reconciliation_candidate_id_idx, …) and lets the
-- planner push the predicate through the coverage view's GROUP BY. Verified to run comfortably under
-- the 8s authenticated cap. Still additive / display-only; admin_stats_cache is untouched.
--
-- Body-only change (signature unchanged) so create-or-replace is fine.

create or replace function public.get_coverage_dashboard_stats()
returns table (
  total_candidates integer,
  total_questions integer,
  no_answers integer,
  low_coverage integer,
  full_coverage integer,
  total_answers bigint,
  total_sourced bigint,
  with_fec_id integer,
  never_synced integer,
  partial_sync integer,
  complete_sync integer,
  legislative_actions bigint,
  floor_votes bigint,
  total_records bigint,
  members_synced integer,
  members_with_floor_votes integer,
  federal_members integer,
  coverage_percentage integer,
  recon_ok integer,
  recon_warning integer,
  recon_partial integer,
  recon_error integer,
  recon_error_gap_usd numeric,
  recon_latest_check timestamptz,
  audited_merges integer,
  sourced_with_url bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_total_questions integer;
  v_ids text[];
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden: admin role required';
  end if;

  select count(*) into v_total_questions from public.questions;

  -- Visible candidate ids resolved once (NULL state = belongs to no hidden state = visible).
  -- A constant array lets every aggregate below use an index scan on candidate_id.
  select coalesce(array_agg(c.id), '{}')
    into v_ids
    from public.candidates c
    where c.state is null
       or upper(c.state) not in (select upper(state_code) from public.get_hidden_state_codes());

  return query
  with
  cand as (
    select c.id, c.office, c.fec_candidate_id, c.last_donor_sync
    from public.candidates c
    where c.id = any(v_ids)
  ),
  ans as (
    select
      count(*)::int as covered,
      count(*) filter (
        where s.answer_count > 0
          and (s.answer_count::numeric / nullif(v_total_questions, 0) * 100) < 30
      )::int as low,
      count(*) filter (
        where (s.answer_count::numeric / nullif(v_total_questions, 0) * 100) >= 80
      )::int as full_cov,
      coalesce(sum(s.answer_count), 0)::bigint as total_answers,
      coalesce(sum(s.sourced_count), 0)::bigint as total_sourced
    from public.candidate_answer_coverage_stats s
    where s.candidate_id = any(v_ids)
  ),
  fec as (
    select
      count(*) filter (where fec_candidate_id is not null)::int as with_fec,
      count(*) filter (where fec_candidate_id is not null and last_donor_sync is null)::int as never_synced
    from cand
  ),
  fec_cmt as (
    select
      count(*) filter (where complete)::int as complete_sync,
      count(*) filter (where synced and not complete)::int as partial_sync
    from (
      select
        cc.candidate_id,
        bool_or(cc.last_sync_completed_at is not null) as synced,
        bool_and(cc.last_sync_completed_at is not null and not coalesce(cc.has_more, false)) as complete
      from public.candidate_committees cc
      where cc.candidate_id = any(v_ids)
      group by cc.candidate_id
    ) per
  ),
  votes as (
    select
      count(*) filter (where lower(cv.action_type) in ('sponsored', 'sponsor'))::bigint as sponsored,
      count(*) filter (where lower(cv.action_type) in ('cosponsored', 'cosponsor'))::bigint as cosponsored,
      count(*) filter (where lower(cv.action_type) = 'floor_vote')::bigint as floor_v
    from public.candidate_votes cv
    where cv.candidate_id = any(v_ids)
  ),
  vss as (
    select
      count(*) filter (where coalesce(vs.persisted_count, 0) > 0 or coalesce(vs.persisted_floor_votes, 0) > 0)::int as members_synced,
      count(*) filter (where coalesce(vs.persisted_floor_votes, 0) > 0)::int as members_floor
    from public.vote_sync_status vs
    where vs.candidate_id = any(v_ids)
  ),
  fed as (
    select count(*)::int as n
    from cand
    where office ilike '%Senator%' or office ilike '%Representative%'
  ),
  recon as (
    select
      count(*) filter (where fr.status = 'ok')::int as ok,
      count(*) filter (where fr.status = 'warning')::int as warning,
      count(*) filter (where fr.status = 'partial')::int as partial,
      count(*) filter (where fr.status = 'error')::int as error,
      coalesce(sum(fr.total_receipts_delta_amount) filter (where fr.status = 'error'), 0)::numeric as gap,
      max(fr.checked_at) as latest_check
    from public.finance_reconciliation fr
    where fr.candidate_id = any(v_ids)
  ),
  merges as (
    select count(*)::int as audited
    from public.candidate_merge_map m
    where m.canonical_id = any(v_ids)
  ),
  url as (
    select count(*)::bigint as sourced_url
    from public.candidate_answers a
    where a.candidate_id = any(v_ids)
      and (a.source_url is not null or coalesce(array_length(a.source_urls, 1), 0) > 0)
  )
  select
    coalesce(array_length(v_ids, 1), 0),
    v_total_questions,
    greatest(coalesce(array_length(v_ids, 1), 0) - ans.covered, 0),
    ans.low,
    ans.full_cov,
    ans.total_answers,
    ans.total_sourced,
    fec.with_fec,
    fec.never_synced,
    fec_cmt.partial_sync,
    fec_cmt.complete_sync,
    (votes.sponsored + votes.cosponsored),
    votes.floor_v,
    (votes.sponsored + votes.cosponsored + votes.floor_v),
    vss.members_synced,
    vss.members_floor,
    fed.n,
    coalesce(round(vss.members_synced::numeric / nullif(fed.n, 0) * 100), 0)::int,
    recon.ok,
    recon.warning,
    recon.partial,
    recon.error,
    recon.gap,
    recon.latest_check,
    merges.audited,
    url.sourced_url
  from ans, fec, fec_cmt, votes, vss, fed, recon, merges, url;
end;
$$;

comment on function public.get_coverage_dashboard_stats() is
  'Admin-only. Headline coverage/FEC/voting counts + candidate-scoped Data Accuracy Scoreboard '
  'metrics (FEC reconciliation, audited merges, URL-sourced answers), filtered to VISIBLE states '
  '(get_hidden_state_codes). Resolves visible candidate ids into an array first so every aggregate '
  'uses an index scan and stays under the authenticated role''s statement_timeout. Display-only — '
  'admin_stats_cache stays the global source of truth for the preflight accuracy scoreboard.';

revoke all on function public.get_coverage_dashboard_stats() from public, anon;
grant execute on function public.get_coverage_dashboard_stats() to authenticated, service_role;
