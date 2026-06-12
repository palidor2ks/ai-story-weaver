-- Donor aggregation: conduit zeroing + memo-X backfill, and the per-candidate
-- "by or through" earmark rollup RPC.
--
-- Problem
-- -------
-- donors.amount / transaction_count were aggregated by three importers that
-- (in different combinations) counted FEC Schedule A lines that must not carry
-- dollars:
--   * memo lines (memo_code = 'X') — informational duplicates of money reported
--     on another countable line (finance_reconciliation already excludes them,
--     see 20260607160000_backfill_memox_finance_reconciliation.sql);
--   * "SEE BELOW" / "EARMARKED CONTRIBUTION:" conduit batch totals;
--   * any line under a conduit org's own name (ACTBLUE / WINRED / DEMOCRACY
--     ENGINE) — payment processors, not donors.
-- Verified example (candidate E000297, Espaillat): the 2026 donors row
-- name='ACTBLUE' held $334,428 / 93 txns with is_conduit_org=false (written by
-- the CSV importer, which had no conduit logic), while the contributions table
-- holds $708,925 of ActBlue memo-X batch lines; AIPAC's 2024 donor row held
-- $171,360 = exactly $10,000 of direct 11C PAC money + $161,360 of memo-X
-- member-earmark attribution lines.
--
-- Fix (this file)
-- ---------------
-- 1. RPC public.get_candidate_earmark_rollups: per (org, cycle) "donated by or
--    through" figures for earmark-program orgs (AIPAC-style) — direct countable
--    dollars + memo-X attributed (routed) dollars, conduit orgs excluded
--    (product decision: never show an aggregated conduit amount).
-- 2. Backfill of public.donors:
--    Arm 1: conduit-named rows -> amount = 0, transaction_count = 0,
--           is_conduit_org = true (unconditional, idempotent).
--    Arm 2: recompute amount/transaction_count from public.contributions for
--           exactly the donor ids that have at least one excluded line, by
--           replicating the importers' SHA-256 donor-id in SQL. Donor ids whose
--           hash finds no donors row are reported (RAISE NOTICE) and left alone.
--    The per-row coverage trigger is disabled for the duration and
--    recalculate_candidate_coverage() runs once per touched candidate at the end.
--
-- The importers now enforce the same rule at write time
-- (supabase/functions/_shared/conduits.ts — keep the conduit name list in sync
-- with the patterns inlined below and in src/lib/conduits.ts).
--
-- Replay-safe: every UPDATE has an idempotent WHERE; re-running is a no-op.
-- Apply notes (owner):
--   * Run at a quiet time: Arm 2 scans the full contributions table once and
--     the transaction holds row locks on the touched donors rows for the
--     duration (minutes at current volume).
--   * AFTER applying, refresh the donor explorer MVs separately (REFRESH ...
--     CONCURRENTLY is illegal inside this transaction):
--       SELECT public.refresh_donor_consolidated_mv();

set statement_timeout = 0;
set lock_timeout = '15s';

-- digest() for the SQL replication of the importers' donor-id hash.
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 1) Earmark rollup RPC
--
-- "How much is org X related to candidate Y" without double counting:
--   direct_amount  = countable lines under the org's own name (its real money;
--                    equals the org's donors-row amount post-backfill).
--   routed_amount  = memo-X lines under the org's name from non-Individual
--                    contributors — the filer's attribution of member earmarks.
--                    These dollars are ALREADY counted under the individual
--                    donors' countable lines; display them as a labeled lens,
--                    never add them into list/category totals.
-- contributions is RLS-locked to admin/service_role, hence SECURITY DEFINER
-- returning aggregates only (same pattern as get_donors_paginated).
-- ---------------------------------------------------------------------------
create or replace function public.get_candidate_earmark_rollups(
  p_candidate_id text,
  p_cycle text default null
)
returns table(
  org_label text,
  org_type text,
  cycle text,
  direct_amount bigint,
  direct_count bigint,
  routed_amount bigint,
  routed_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with lines as (
    select
      upper(btrim(c.contributor_name)) as org_key,
      max(c.contributor_name)          as org_label,
      max(coalesce(c.contributor_type, 'Unknown')) as org_type,
      c.cycle,
      sum(c.amount) filter (where upper(btrim(coalesce(c.memo_code,''))) = 'X')  as routed_amount,
      count(*)      filter (where upper(btrim(coalesce(c.memo_code,''))) = 'X')  as routed_count,
      sum(c.amount) filter (
        where upper(btrim(coalesce(c.memo_code,''))) <> 'X'
          and upper(coalesce(c.memo_text,'')) not like '%SEE BELOW%'
          and upper(coalesce(c.memo_text,'')) not like '%EARMARKED CONTRIBUTION:%'
      ) as direct_amount,
      count(*) filter (
        where upper(btrim(coalesce(c.memo_code,''))) <> 'X'
          and upper(coalesce(c.memo_text,'')) not like '%SEE BELOW%'
          and upper(coalesce(c.memo_text,'')) not like '%EARMARKED CONTRIBUTION:%'
      ) as direct_count
    from public.contributions c
    join public.candidate_committees cc
      on cc.fec_committee_id = c.recipient_committee_id
    where p_candidate_id is not null
      and length(p_candidate_id) <= 64
      and cc.candidate_id = p_candidate_id
      and cc.active = true
      and cc.designation in ('P','A','J')   -- mirrors isAuthorizedRecipient (src/hooks/useCandidates.ts)
      -- Orgs only. Stricter than <> 'Individual' so a mistyped/Unknown individual
      -- can never surface here (security review 2026-06-12); live data has zero
      -- Unknown-typed memo-X rows on line 11, so nothing is lost.
      and coalesce(c.contributor_type, 'Unknown') in ('PAC', 'Organization')
      and upper(coalesce(c.line_number,'')) like '11%'  -- contribution lines only (not Line-12 JFC attribution)
      and coalesce(c.is_transfer, false) = false
      and coalesce(c.is_contribution, true) = true
      -- Conduits never get an aggregated figure (keep in sync with the TS modules)
      and upper(c.contributor_name) not like '%ACTBLUE%'
      and upper(c.contributor_name) not like '%WINRED%'
      and upper(c.contributor_name) not like '%DEMOCRACY ENGINE%'
      and (p_cycle is null or p_cycle = '' or p_cycle = 'all' or c.cycle = p_cycle)
    group by 1, c.cycle
  )
  select
    org_label,
    org_type,
    cycle,
    coalesce(direct_amount, 0)::bigint,
    coalesce(direct_count, 0)::bigint,
    coalesce(routed_amount, 0)::bigint,
    coalesce(routed_count, 0)::bigint
  from lines
  where coalesce(routed_amount, 0) > 0
  order by coalesce(routed_amount, 0) + coalesce(direct_amount, 0) desc, cycle desc
  limit 500;
$$;

comment on function public.get_candidate_earmark_rollups(text, text) is
  'Per (org, cycle) "donated by or through" rollup for earmark-program orgs (e.g. AIPAC): '
  'direct = countable Schedule A dollars under the org''s name; routed = memo-X attribution '
  'dollars (already counted under the individual donors — display-only lens). '
  'Conduit processors (ActBlue/WinRed/Democracy Engine) are excluded by design.';

grant execute on function public.get_candidate_earmark_rollups(text, text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) donors backfill
-- ---------------------------------------------------------------------------
do $do$
declare
  v_trigger_disabled boolean := false;
  v_arm1 bigint := 0;
  v_arm2 bigint := 0;
  v_hash_misses bigint := 0;
  v_candidates bigint := 0;
  rec record;
begin
  -- Skip cleanly on databases missing the expected schema (preview branches
  -- rebuilt purely from migrations may drift; the data fix must not fail them).
  if exists (
    select 1 from unnest(array['id','name','amount','transaction_count','is_conduit_org','candidate_id']) as req(col)
    where not exists (
      select 1 from information_schema.columns ic
      where ic.table_schema = 'public' and ic.table_name = 'donors' and ic.column_name = req.col
    )
  ) or exists (
    select 1 from unnest(array[
      'contributor_name','contributor_type','contributor_city','contributor_state','contributor_zip',
      'recipient_committee_id','cycle','amount','memo_code','memo_text'
    ]) as req(col)
    where not exists (
      select 1 from information_schema.columns ic
      where ic.table_schema = 'public' and ic.table_name = 'contributions' and ic.column_name = req.col
    )
  ) then
    raise notice 'conduit/memo-X donor backfill skipped: donors/contributions schema is missing expected columns on this database; no rows changed.';
    return;
  end if;

  -- The per-row AFTER UPDATE trigger would run recalculate_candidate_coverage()
  -- once per touched row; disable it and recalc once per candidate at the end.
  if exists (
    select 1 from pg_trigger
    where tgname = 'trg_recalc_coverage_on_donor_update'
      and tgrelid = 'public.donors'::regclass
  ) then
    alter table public.donors disable trigger trg_recalc_coverage_on_donor_update;
    v_trigger_disabled := true;
  end if;

  create temp table _upd_log(arm int, candidate_id text) on commit drop;

  -- Arm 1: conduit rows carry no dollars and no transaction count, ever.
  with upd as (
    update public.donors
    set amount = 0,
        transaction_count = 0,
        is_conduit_org = true
    where (
        upper(name) like '%ACTBLUE%'
        or upper(name) like '%WINRED%'
        or upper(name) like '%DEMOCRACY ENGINE%'
        or is_conduit_org = true
      )
      and (amount <> 0 or coalesce(transaction_count, 0) <> 0 or is_conduit_org is distinct from true)
    returning candidate_id
  )
  insert into _upd_log select 1, candidate_id from upd;

  -- Arm 2: recompute the donor rows contaminated by excluded lines.
  -- Replicates generateDonorId() from fetch-fec-donors / import-fec-receipts-csv:
  --   Individual:  lower(trim(name))|lower(trim(city))|upper(trim(state))|zip[0:5]|committee|cycle
  --   otherwise:   lower(trim(name))|upper(trim(state))|committee|cycle
  --   id = 'fec-' || first 32 hex chars of sha256(identity_key)
  -- (raw entity_type 'IND' maps 1:1 to contributor_type 'Individual'.)
  -- Groups whose hash matches no donors row are counted and left untouched —
  -- recompute only what we can identify exactly.
  create temp table _affected on commit drop as
  with grouped as (
    select
      case when c.contributor_type = 'Individual' then
        lower(btrim(c.contributor_name)) || '|' ||
        lower(btrim(coalesce(c.contributor_city, ''))) || '|' ||
        upper(btrim(coalesce(c.contributor_state, ''))) || '|' ||
        left(coalesce(c.contributor_zip, ''), 5) || '|' ||
        c.recipient_committee_id || '|' || c.cycle
      else
        lower(btrim(c.contributor_name)) || '|' ||
        upper(btrim(coalesce(c.contributor_state, ''))) || '|' ||
        c.recipient_committee_id || '|' || c.cycle
      end as identity_key,
      sum(case when upper(btrim(coalesce(c.memo_code,''))) <> 'X'
                and upper(coalesce(c.memo_text,'')) not like '%SEE BELOW%'
                and upper(coalesce(c.memo_text,'')) not like '%EARMARKED CONTRIBUTION:%'
                and upper(c.contributor_name) not like '%ACTBLUE%'
                and upper(c.contributor_name) not like '%WINRED%'
                and upper(c.contributor_name) not like '%DEMOCRACY ENGINE%'
               then c.amount else 0 end) as new_amount,
      count(*) filter (where upper(btrim(coalesce(c.memo_code,''))) <> 'X'
                and upper(coalesce(c.memo_text,'')) not like '%SEE BELOW%'
                and upper(coalesce(c.memo_text,'')) not like '%EARMARKED CONTRIBUTION:%'
                and upper(c.contributor_name) not like '%ACTBLUE%'
                and upper(c.contributor_name) not like '%WINRED%'
                and upper(c.contributor_name) not like '%DEMOCRACY ENGINE%') as new_txn_count,
      bool_or(upper(btrim(coalesce(c.memo_code,''))) = 'X'
              or upper(coalesce(c.memo_text,'')) like '%SEE BELOW%'
              or upper(coalesce(c.memo_text,'')) like '%EARMARKED CONTRIBUTION:%'
              or upper(c.contributor_name) like '%ACTBLUE%'
              or upper(c.contributor_name) like '%WINRED%'
              or upper(c.contributor_name) like '%DEMOCRACY ENGINE%') as has_excluded
    from public.contributions c
    where c.contributor_name is not null
      and c.recipient_committee_id is not null
      and c.cycle is not null
    group by 1
  )
  select
    'fec-' || left(encode(extensions.digest(identity_key, 'sha256'), 'hex'), 32) as donor_id,
    new_amount,
    new_txn_count
  from grouped
  where has_excluded;

  select count(*) into v_hash_misses
  from _affected a
  where not exists (select 1 from public.donors d where d.id = a.donor_id);

  with upd as (
    update public.donors d
    set amount = a.new_amount::integer,
        transaction_count = a.new_txn_count::integer
    from _affected a
    where d.id = a.donor_id
      and coalesce(d.is_conduit_org, false) = false  -- Arm 1 already finalized conduit rows
      and (d.amount <> a.new_amount or coalesce(d.transaction_count, 0) <> a.new_txn_count)
    returning d.candidate_id
  )
  insert into _upd_log select 2, candidate_id from upd;

  select count(*) filter (where arm = 1), count(*) filter (where arm = 2)
    into v_arm1, v_arm2
  from _upd_log;

  -- One coverage recalc per touched candidate (replaces the disabled per-row trigger).
  if to_regprocedure('public.recalculate_candidate_coverage(text)') is not null then
    for rec in select distinct candidate_id from _upd_log where candidate_id is not null loop
      perform public.recalculate_candidate_coverage(rec.candidate_id);
      v_candidates := v_candidates + 1;
    end loop;
  else
    raise notice 'recalculate_candidate_coverage(text) not found; skipped coverage recalc.';
  end if;

  if v_trigger_disabled then
    alter table public.donors enable trigger trg_recalc_coverage_on_donor_update;
  end if;

  raise notice 'conduit/memo-X donor backfill: % conduit rows zeroed (arm 1), % rows recomputed (arm 2), % contaminated donor ids had no matching donors row (left untouched), % candidates'' coverage recalculated. Remember: SELECT public.refresh_donor_consolidated_mv();',
    v_arm1, v_arm2, v_hash_misses, v_candidates;
end
$do$;
