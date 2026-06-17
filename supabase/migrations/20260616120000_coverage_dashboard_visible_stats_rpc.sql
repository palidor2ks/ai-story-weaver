-- Visible-states-only headline numbers for the Coverage & Finance Dashboard.
--
-- Why: the dashboard's tiles (Candidate Answers, Source Quality, FEC Data, Congressional
-- Voting Records) read the global admin_stats_cache rows, which count EVERY state. But the
-- product only serves "visible" states (hidden states are managed in the Visible States admin
-- panel; today only NC + NJ are visible, ~172 of 2,392 candidates). So the dashboard reported
-- numbers ~14x larger than the work that actually matters. The Finance Coverage chart already
-- excludes hidden states (get_finance_cycle_summary); this brings the headline tiles in line.
--
-- IMPORTANT — this is purely ADDITIVE and does NOT touch admin_stats_cache or
-- refresh_admin_stats_cache(). Those global rows remain the single source of truth for the
-- preflight data-accuracy scoreboard (scripts/check-data-accuracy.sh) and docs/DATA-ACCURACY.md,
-- whose thresholds/baselines are measured against the WHOLE database on purpose (they track the
-- full backlog, including states not yet launched). The dashboard simply DISPLAYS the
-- visible-states slice via this function; the accuracy contract is unchanged.
--
-- Definitions mirror refresh_admin_stats_cache() exactly, just filtered to visible states, so a
-- tile here is the same metric as its global counterpart — only the row set differs. Admin-only,
-- read-only, security definer (same shape as get_finance_cycle_summary). Candidates with a NULL
-- state are treated as visible (they belong to no hidden state), matching the finance summary.

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
  coverage_percentage integer
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
    coalesce(round(vss.members_synced::numeric / nullif(fed.n, 0) * 100), 0)::int
  from ans, fec, fec_cmt, votes, vss, fed;
end;
$$;

comment on function public.get_coverage_dashboard_stats() is
  'Admin-only. Headline coverage/FEC/voting counts for the dashboard, filtered to VISIBLE states '
  '(hidden states excluded via get_hidden_state_codes). Mirrors refresh_admin_stats_cache definitions '
  'but is display-only — admin_stats_cache stays the global source of truth for the accuracy scoreboard.';

-- Authenticated admins call this directly (like get_finance_cycle_summary); the has_role() gate
-- above is the real authorization. We also explicitly revoke from public/anon so the only path
-- in is an authenticated session — defense in depth, slightly stricter than the default grant.
revoke all on function public.get_coverage_dashboard_stats() from public, anon;
grant execute on function public.get_coverage_dashboard_stats() to authenticated, service_role;
