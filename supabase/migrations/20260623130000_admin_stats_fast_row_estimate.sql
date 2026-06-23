-- Fix statement timeout in refresh_admin_stats_cache (state_finance_stats).
--
-- count(*) on nj_elec_contributions, fl_contributions, ny_contributions, and
-- tx_cf_contributions was timing out — these are large tables and a full scan
-- every 15 minutes is too expensive. Replace with n_live_tup from
-- pg_stat_user_tables, which is an O(1) autovacuum-maintained estimate.
-- For an admin dashboard that shows "roughly how many rows", this is exact enough.
--
-- Full function rewrite (absorbs the tx_cf patch from 20260621060000) so this
-- file is self-contained and a future reader doesn't have to diff three files.

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

    select count(*),
           count(*) filter (where answer_count > 0
                              and (answer_count::numeric / nullif(v_total_questions,0) * 100) < 30),
           count(*) filter (where (answer_count::numeric / nullif(v_total_questions,0) * 100) >= 80),
           coalesce(sum(answer_count),0),
           coalesce(sum(sourced_count),0)
      into v_covered, v_low, v_full, v_total_answers, v_total_sourced
      from candidate_answer_coverage_stats;

    v_no_answers := greatest(v_total_candidates - v_covered, 0);

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
  -- state_finance_stats: contribution row counts use pg_stat_user_tables.n_live_tup
  -- (autovacuum-maintained estimate) instead of count(*) — the large tables were
  -- timing out the cron every 15 minutes. Accuracy is sufficient for an admin tile.
  if p_keys is null or 'state_finance_stats' = any(p_keys) then
    v := jsonb_build_object(
      'nj', (select jsonb_build_object(
               'contributions', coalesce(
                 (select n_live_tup from pg_stat_user_tables where relname = 'nj_elec_contributions'),
                 0),
               'lastRun',  max(finished_at),
               'errors7d', count(*) filter (where status = 'error' and started_at > now() - interval '7 days'))
              from nj_elec_sync_runs),
      'fl', (select jsonb_build_object(
               'contributions', coalesce(
                 (select n_live_tup from pg_stat_user_tables where relname = 'fl_contributions'),
                 0),
               'lastRun',  max(finished_at),
               'errors7d', count(*) filter (where status = 'error' and started_at > now() - interval '7 days'))
              from fl_sync_runs),
      'ny', (select jsonb_build_object(
               'contributions', coalesce(
                 (select n_live_tup from pg_stat_user_tables where relname = 'ny_contributions'),
                 0),
               'lastRun',  max(finished_at),
               'errors7d', count(*) filter (where status = 'error' and started_at > now() - interval '7 days'))
              from ny_sync_runs),
      'tx', (select jsonb_build_object(
               'contributions', coalesce(
                 (select n_live_tup from pg_stat_user_tables where relname = 'tx_cf_contributions'),
                 0),
               'lastRun',  max(finished_at),
               'errors7d', count(*) filter (where status = 'error' and started_at > now() - interval '7 days'))
              from tx_cf_sync_runs)
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

-- Re-apply permissions (required after CREATE OR REPLACE).
revoke all on function public.refresh_admin_stats_cache(text[]) from public, anon, authenticated;
grant execute on function public.refresh_admin_stats_cache(text[]) to service_role;

-- Re-seed the cache immediately with the fixed function (guarded against schema drift).
do $$ begin
  perform public.refresh_admin_stats_cache(array['state_finance_stats']);
exception when others then
  raise notice 'state_finance_stats seed skipped: %', sqlerrm;
end $$;
