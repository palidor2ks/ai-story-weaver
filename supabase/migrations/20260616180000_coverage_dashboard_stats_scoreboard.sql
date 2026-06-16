-- Extend get_coverage_dashboard_stats() with the Data Accuracy Scoreboard's candidate-scoped
-- metrics, filtered to visible states, so that section of the dashboard matches the rest.
--
-- Background: migration 20260616120000 scoped the dashboard's headline tiles (answers, FEC, voting)
-- to visible states via this function, but the Data Accuracy Scoreboard kept reading the global
-- admin_stats_cache. Per product decision (2026-06-16) the scoreboard's candidate-based cards
-- should also show the visible slice:
--   • FEC reconciliation (ok/warning/partial/error + error gap + latest check)
--   • Candidate identity → audited merges (the "candidates" count already comes from total_candidates)
--   • Answers URL-sourced (answers carrying a real source URL)
-- Bills freshness stays national and State finance stays per-state (NJ/FL/NY) — those are not
-- candidate-state-scoped, so they keep reading the global cache.
--
-- Still ADDITIVE/display-only: admin_stats_cache and refresh_admin_stats_cache() are untouched, so
-- the preflight check:accuracy gate and docs/DATA-ACCURACY.md baselines remain whole-database. The
-- new recon/merge/URL fields mirror those cache definitions exactly, just filtered to visible states.
--
-- The return signature gains columns, which create-or-replace cannot do, so drop then recreate.

drop function if exists public.get_coverage_dashboard_stats();

create function public.get_coverage_dashboard_stats()
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
  -- Data Accuracy Scoreboard (visible-states slice; bills + state-finance stay global/per-state)
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
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden: admin role required';
  end if;

  -- Questions are not state-scoped; the global count is the right denominator (matches the
  -- global candidate_answer_stats tile and keeps coverage percentages comparable).
  select count(*) into v_total_questions from public.questions;

  return query
  with hidden as (
    select upper(state_code) as code from public.get_hidden_state_codes()
  ),
  visible_cand as (
    select c.id, c.office, c.fec_candidate_id, c.last_donor_sync
    from public.candidates c
    where c.state is null or upper(c.state) not in (select code from hidden)
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
    join visible_cand vc on vc.id = s.candidate_id
  ),
  fec as (
    select
      count(*) filter (where fec_candidate_id is not null)::int as with_fec,
      count(*) filter (where fec_candidate_id is not null and last_donor_sync is null)::int as never_synced
    from visible_cand
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
      join visible_cand vc on vc.id = cc.candidate_id
      where cc.candidate_id is not null
      group by cc.candidate_id
    ) per
  ),
  votes as (
    select
      count(*) filter (where lower(cv.action_type) in ('sponsored', 'sponsor'))::bigint as sponsored,
      count(*) filter (where lower(cv.action_type) in ('cosponsored', 'cosponsor'))::bigint as cosponsored,
      count(*) filter (where lower(cv.action_type) = 'floor_vote')::bigint as floor_v
    from public.candidate_votes cv
    join visible_cand vc on vc.id = cv.candidate_id
  ),
  vss as (
    select
      count(*) filter (where coalesce(vs.persisted_count, 0) > 0 or coalesce(vs.persisted_floor_votes, 0) > 0)::int as members_synced,
      count(*) filter (where coalesce(vs.persisted_floor_votes, 0) > 0)::int as members_floor
    from public.vote_sync_status vs
    join visible_cand vc on vc.id = vs.candidate_id
  ),
  fed as (
    select count(*)::int as n
    from visible_cand
    where office ilike '%Senator%' or office ilike '%Representative%'
  ),
  -- finance_reconciliation across all cycles (mirrors finance_recon_stats), visible states only
  recon as (
    select
      count(*) filter (where fr.status = 'ok')::int as ok,
      count(*) filter (where fr.status = 'warning')::int as warning,
      count(*) filter (where fr.status = 'partial')::int as partial,
      count(*) filter (where fr.status = 'error')::int as error,
      coalesce(sum(fr.total_receipts_delta_amount) filter (where fr.status = 'error'), 0)::numeric as gap,
      max(fr.checked_at) as latest_check
    from public.finance_reconciliation fr
    join visible_cand vc on vc.id = fr.candidate_id
  ),
  -- audited merges whose surviving (canonical) candidate is visible
  merges as (
    select count(*)::int as audited
    from public.candidate_merge_map m
    join visible_cand vc on vc.id = m.canonical_id
  ),
  -- answers carrying a real source URL (mirrors candidate_answer_stats.sourcedWithUrl)
  url as (
    select count(*)::bigint as sourced_url
    from public.candidate_answers a
    join visible_cand vc on vc.id = a.candidate_id
    where a.source_url is not null or coalesce(array_length(a.source_urls, 1), 0) > 0
  )
  select
    (select count(*)::int from visible_cand),
    v_total_questions,
    greatest((select count(*)::int from visible_cand) - ans.covered, 0),
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
  'Admin-only. Headline coverage/FEC/voting counts + the candidate-scoped Data Accuracy Scoreboard '
  'metrics (FEC reconciliation, audited merges, URL-sourced answers) for the dashboard, filtered to '
  'VISIBLE states (hidden states excluded via get_hidden_state_codes). Mirrors refresh_admin_stats_cache '
  'definitions but is display-only — admin_stats_cache stays the global source of truth for the accuracy scoreboard.';

revoke all on function public.get_coverage_dashboard_stats() from public, anon;
grant execute on function public.get_coverage_dashboard_stats() to authenticated, service_role;
