-- Admin stats cache: one SQL source of truth, refreshed automatically.
--
-- Why: the Coverage & Finance dashboard read admin_stats_cache rows that were only
-- recomputed when an admin clicked refresh — voting_records_stats had been stale since
-- 2026-01-19 because the edge function depended on a materialized view
-- (vote_action_counts) that doesn't exist in this database (migration drift), and the
-- failure was silent. This migration moves ALL stat computation into one SQL function
-- (no MV dependency — votes are counted from base tables), extends it to the data
-- categories the dashboard didn't cover (bills freshness, state campaign finance,
-- finance reconciliation, candidate identity), and schedules it every 15 minutes so the
-- dashboard and the preflight data-accuracy check always describe where we truly are.
--
-- Writes ONLY to admin_stats_cache (admin-read, service-write). Read-only on all other
-- tables. The refresh-admin-stats edge function delegates here so the dashboard's
-- manual refresh buttons and the cron share identical definitions.

create or replace function public.refresh_admin_stats_cache(p_keys text[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_results jsonb := '{}'::jsonb;
  v jsonb;
  -- voting
  v_sponsored bigint; v_cosponsored bigint; v_floor bigint;
  v_members_synced int; v_members_floor int; v_sync_errors int; v_floor_errors int;
  v_incomplete int; v_latest_sync timestamptz; v_total_federal int;
  -- answers
  v_total_questions int; v_total_candidates int;
  v_no_answers int; v_low int; v_full int; v_covered int;
  v_total_answers bigint; v_total_sourced bigint; v_sourced_url bigint; v_latest_answer timestamptz;
  -- fec
  v_with_fec int; v_never int; v_complete int; v_partial int;
  -- bills
  v_bills bigint; v_sponsors bigint; v_bill_sync timestamptz; v_bill_err text;
begin
  ---------------------------------------------------------------------------
  if p_keys is null or 'voting_records_stats' = any(p_keys) then
    -- Counted from base tables on purpose: the old path used the vote_action_counts
    -- materialized view, which is missing here (drift) and failed silently. Live labels
    -- are 'sponsor'/'cosponsor' (the old code looked up 'sponsored'/'cosponsored' and
    -- got zero); accept both spellings so a future rename can't zero the tile again.
    select count(*) filter (where lower(action_type) in ('sponsored','sponsor')),
           count(*) filter (where lower(action_type) in ('cosponsored','cosponsor')),
           count(*) filter (where lower(action_type) = 'floor_vote')
      into v_sponsored, v_cosponsored, v_floor
      from candidate_votes;

    select count(*) filter (where coalesce(persisted_count,0) > 0 or coalesce(persisted_floor_votes,0) > 0),
           count(*) filter (where coalesce(persisted_floor_votes,0) > 0),
           count(*) filter (where sync_error is not null),
           count(*) filter (where floor_vote_sync_error is not null),
           count(*) filter (where coalesce(persisted_count,0) < coalesce(expected_total,0)),
           max(last_sync_completed_at)
      into v_members_synced, v_members_floor, v_sync_errors, v_floor_errors, v_incomplete, v_latest_sync
      from vote_sync_status;

    select count(*) into v_total_federal
      from candidates
     where office ilike '%Senator%' or office ilike '%Representative%';

    v := jsonb_build_object(
      'legislativeActions', v_sponsored + v_cosponsored,
      'floorVotes',         v_floor,
      'totalRecords',       v_sponsored + v_cosponsored + v_floor,
      'membersSynced',      v_members_synced,
      'membersWithFloorVotes', v_members_floor,
      'coveragePercentage', coalesce(round(v_members_synced::numeric / nullif(v_total_federal,0) * 100), 0),
      'syncErrors',         v_sync_errors,
      'floorSyncErrors',    v_floor_errors,
      'incompleteMembers',  v_incomplete,
      'latestSync',         v_latest_sync
    );
    insert into admin_stats_cache (stat_key, stat_value, updated_at)
    values ('voting_records_stats', v, now())
    on conflict (stat_key) do update set stat_value = excluded.stat_value, updated_at = excluded.updated_at;
    v_results := v_results || jsonb_build_object('voting_records_stats', v);
  end if;

  ---------------------------------------------------------------------------
  if p_keys is null or 'candidate_answer_stats' = any(p_keys) then
    select count(*) into v_total_questions from questions;
    select count(*) into v_total_candidates from candidates;

    -- Same definitions as the dashboard has always used (candidate_answer_coverage_stats:
    -- "sourced" = substantive source_description, excluding platform/inferred).
    select count(*),
           count(*) filter (where answer_count > 0
                              and (answer_count::numeric / nullif(v_total_questions,0) * 100) < 30),
           count(*) filter (where (answer_count::numeric / nullif(v_total_questions,0) * 100) >= 80),
           coalesce(sum(answer_count),0),
           coalesce(sum(sourced_count),0)
      into v_covered, v_low, v_full, v_total_answers, v_total_sourced
      from candidate_answer_coverage_stats;

    v_no_answers := greatest(v_total_candidates - v_covered, 0);

    -- Stricter signal the dashboard lacked: answers with an actual source URL.
    select count(*), max(updated_at)
      into v_sourced_url, v_latest_answer
      from candidate_answers
     where source_url is not null or coalesce(array_length(source_urls,1),0) > 0;

    v := jsonb_build_object(
      'totalCandidates', v_total_candidates,
      'totalQuestions',  v_total_questions,
      'noAnswers',       v_no_answers,
      'lowCoverage',     v_low,
      'fullCoverage',    v_full,
      'totalAnswers',    v_total_answers,
      'totalSourced',    v_total_sourced,
      'sourcedWithUrl',  v_sourced_url,
      'latestUpdate',    v_latest_answer
    );
    insert into admin_stats_cache (stat_key, stat_value, updated_at)
    values ('candidate_answer_stats', v, now())
    on conflict (stat_key) do update set stat_value = excluded.stat_value, updated_at = excluded.updated_at;
    v_results := v_results || jsonb_build_object('candidate_answer_stats', v);
  end if;

  ---------------------------------------------------------------------------
  if p_keys is null or 'fec_stats' = any(p_keys) then
    select count(*) filter (where fec_candidate_id is not null),
           count(*) filter (where fec_candidate_id is not null and last_donor_sync is null)
      into v_with_fec, v_never
      from candidates;

    with per_cand as (
      select candidate_id,
             bool_or(last_sync_completed_at is not null) as synced,
             bool_and(last_sync_completed_at is not null and not coalesce(has_more, false)) as complete
        from candidate_committees
       where candidate_id is not null
       group by candidate_id
    )
    select count(*) filter (where complete),
           count(*) filter (where synced and not complete)
      into v_complete, v_partial
      from per_cand;

    v := jsonb_build_object(
      'withFecId',   v_with_fec,
      'neverSynced', v_never,
      'partialSync', v_partial,
      'complete',    v_complete
    );
    insert into admin_stats_cache (stat_key, stat_value, updated_at)
    values ('fec_stats', v, now())
    on conflict (stat_key) do update set stat_value = excluded.stat_value, updated_at = excluded.updated_at;
    v_results := v_results || jsonb_build_object('fec_stats', v);
  end if;

  ---------------------------------------------------------------------------
  if p_keys is null or 'bills_stats' = any(p_keys) then
    select count(*) into v_bills from bills;
    select count(*) into v_sponsors from bill_sponsors;
    select last_sync_completed_at, error_message
      into v_bill_sync, v_bill_err
      from bill_sync_status
     where sync_type = 'nightly'
     order by last_sync_completed_at desc nulls last
     limit 1;

    v := jsonb_build_object(
      'totalBills',    v_bills,
      'totalSponsors', v_sponsors,
      'lastNightlySync', v_bill_sync,
      'staleDays',     coalesce(extract(day from now() - v_bill_sync)::int, -1),
      'lastError',     v_bill_err
    );
    insert into admin_stats_cache (stat_key, stat_value, updated_at)
    values ('bills_stats', v, now())
    on conflict (stat_key) do update set stat_value = excluded.stat_value, updated_at = excluded.updated_at;
    v_results := v_results || jsonb_build_object('bills_stats', v);
  end if;

  ---------------------------------------------------------------------------
  if p_keys is null or 'state_finance_stats' = any(p_keys) then
    v := jsonb_build_object(
      'nj', (select jsonb_build_object(
               'contributions', (select count(*) from nj_elec_contributions),
               'lastRun',  max(finished_at),
               'errors7d', count(*) filter (where status = 'error' and started_at > now() - interval '7 days'))
              from nj_elec_sync_runs),
      'fl', (select jsonb_build_object(
               'contributions', (select count(*) from fl_contributions),
               'lastRun',  max(finished_at),
               'errors7d', count(*) filter (where status = 'error' and started_at > now() - interval '7 days'))
              from fl_sync_runs),
      'ny', (select jsonb_build_object(
               'contributions', (select count(*) from ny_contributions),
               'lastRun',  max(finished_at),
               'errors7d', count(*) filter (where status = 'error' and started_at > now() - interval '7 days'))
              from ny_sync_runs)
    );
    insert into admin_stats_cache (stat_key, stat_value, updated_at)
    values ('state_finance_stats', v, now())
    on conflict (stat_key) do update set stat_value = excluded.stat_value, updated_at = excluded.updated_at;
    v_results := v_results || jsonb_build_object('state_finance_stats', v);
  end if;

  ---------------------------------------------------------------------------
  if p_keys is null or 'finance_recon_stats' = any(p_keys) then
    select jsonb_build_object(
      'ok',          count(*) filter (where status = 'ok'),
      'warning',     count(*) filter (where status = 'warning'),
      'partial',     count(*) filter (where status = 'partial'),
      'error',       count(*) filter (where status = 'error'),
      'latestCheck', max(checked_at),
      'errorGapUsd', coalesce(sum(total_receipts_delta_amount) filter (where status = 'error'), 0)
    )
      into v
      from finance_reconciliation;
    insert into admin_stats_cache (stat_key, stat_value, updated_at)
    values ('finance_recon_stats', v, now())
    on conflict (stat_key) do update set stat_value = excluded.stat_value, updated_at = excluded.updated_at;
    v_results := v_results || jsonb_build_object('finance_recon_stats', v);
  end if;

  ---------------------------------------------------------------------------
  if p_keys is null or 'identity_stats' = any(p_keys) then
    v := jsonb_build_object(
      'candidates',    (select count(*) from candidates),
      'persons',       (select count(*) from persons),
      'auditedMerges', (select count(*) from candidate_merge_map)
    );
    insert into admin_stats_cache (stat_key, stat_value, updated_at)
    values ('identity_stats', v, now())
    on conflict (stat_key) do update set stat_value = excluded.stat_value, updated_at = excluded.updated_at;
    v_results := v_results || jsonb_build_object('identity_stats', v);
  end if;

  return v_results;
end;
$fn$;

-- Tight execution surface: cron runs as the function owner; the edge function uses the
-- service role. Nothing client-side may call this directly.
revoke all on function public.refresh_admin_stats_cache(text[]) from public, anon, authenticated;
grant execute on function public.refresh_admin_stats_cache(text[]) to service_role;

-- Refresh every 15 minutes — the ingestion drains run every 3–10 minutes, so this keeps
-- the dashboard within one cycle of "after each update of data". Idempotent reschedule,
-- and guarded so environments without pg_cron (some previews/local) still migrate.
do $$ begin perform cron.unschedule('refresh-admin-stats-cache'); exception when others then null; end $$;
do $$ begin
  perform cron.schedule('refresh-admin-stats-cache', '*/15 * * * *',
                        'select public.refresh_admin_stats_cache()');
exception when others then
  raise notice 'refresh-admin-stats-cache cron not scheduled on this environment: %', sqlerrm;
end $$;

-- Seed immediately so the dashboard is truthful the moment this lands. Guarded: preview
-- branches and Dev are built from migration files only, and prod carries drifted columns
-- the files never created (e.g. last_sync_completed_at — the known Dev-vs-main drift,
-- ROADMAP #2). A failed stats seed must not sink an entire branch deploy; the cron will
-- retry every 15 minutes wherever the schema actually supports it.
do $$ begin
  perform public.refresh_admin_stats_cache();
exception when others then
  raise notice 'admin stats seed skipped (schema drift on this environment): %', sqlerrm;
end $$;
