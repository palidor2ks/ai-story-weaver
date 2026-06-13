-- Candidate self-contributions (Line 11D / personal funds) must not appear as donors.
--
-- Problem
-- -------
-- FEC reports a candidate's own personal-funds CONTRIBUTIONS (distinct from
-- Line 13 loans) on Line 11D, with the FEC entity type "candidate". This feed
-- mislabels that entity type as "Organization" and the importers classified any
-- Line 11* row as is_contribution=true, so a candidate's self-funding was
-- aggregated into public.donors and surfaced as their own #1 "top donor"
-- (e.g. Arquette $3.3M, Rick Scott, Sara Jacobs, Michelle Steel "- PERSONAL FUNDS").
--
-- Confirmed: Line 11D == FEC's candidate_contribution summary field. Where a
-- candidate has a fresh finance_reconciliation row, local SUM(11D) matches
-- fec_candidate_contribution to the dollar (Arquette 3,300,000; Steel 1,131,500;
-- Jacobs 929,347; Rick Scott 1,255,016). So this money is already represented as
-- self-funding via fec_candidate_contribution — it just must not also be a donor.
--
-- Fix
-- ---
-- The importers now classify Line 11D as is_contribution=false (candidate
-- self-funding, not a donor contribution). This migration backfills existing data:
--   Arm A: contributions.is_contribution := false for every Line-11D row.
--   Arm B: recompute public.donors (amount / transaction_count / is_contribution)
--          for the donor identities that had a Line-11D row, by replicating the
--          importers' SHA-256 donor-id — same pattern as 20260613040000
--          (loans) and 20260612120000 (conduits). A donor left with no countable
--          contribution dollars (a pure self-funder) gets is_contribution=false
--          and drops out of donor lists.
--
-- Finance reconciliation is unaffected: get_contribution_totals keys its itemized
-- buckets off Lines 11AI/11B/11C (never 11D), and the "Self-Funded" figure comes
-- from fec_candidate_contribution. Replay-safe / idempotent.
-- Apply notes (owner): run with no statement timeout (dashboard SQL editor or
--   psql). AFTER applying: SELECT public.refresh_donor_consolidated_mv();

set statement_timeout = 0;
set lock_timeout = '15s';

create extension if not exists pgcrypto with schema extensions;

do $do$
declare
  v_trigger_disabled boolean := false;
  v_arm_a bigint := 0;
  v_arm_b bigint := 0;
  v_hash_misses bigint := 0;
  v_candidates bigint := 0;
  rec record;
begin
  if exists (
    select 1 from unnest(array['id','name','amount','transaction_count','is_contribution','candidate_id']) as req(col)
    where not exists (
      select 1 from information_schema.columns ic
      where ic.table_schema = 'public' and ic.table_name = 'donors' and ic.column_name = req.col
    )
  ) or exists (
    select 1 from unnest(array[
      'contributor_name','contributor_type','contributor_city','contributor_state','contributor_zip',
      'recipient_committee_id','cycle','amount','memo_code','memo_text','line_number','is_contribution'
    ]) as req(col)
    where not exists (
      select 1 from information_schema.columns ic
      where ic.table_schema = 'public' and ic.table_name = 'contributions' and ic.column_name = req.col
    )
  ) then
    raise notice 'candidate self-contribution backfill skipped: donors/contributions schema missing expected columns; no rows changed.';
    return;
  end if;

  -- Arm A: Line 11D = candidate self-funding, not a donor contribution.
  with upd as (
    update public.contributions
    set is_contribution = false
    where upper(line_number) like '11D%'
      and is_contribution is distinct from false
    returning 1
  )
  select count(*) into v_arm_a from upd;

  if exists (
    select 1 from pg_trigger
    where tgname = 'trg_recalc_coverage_on_donor_update'
      and tgrelid = 'public.donors'::regclass
  ) then
    alter table public.donors disable trigger trg_recalc_coverage_on_donor_update;
    v_trigger_disabled := true;
  end if;

  -- Arm B: recompute donor rows for identities that had a Line-11D row.
  create temp table _sc_affected on commit drop as
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
      sum(case when c.is_contribution = true
                and upper(btrim(coalesce(c.memo_code,''))) <> 'X'
                and upper(coalesce(c.memo_text,'')) not like '%SEE BELOW%'
                and upper(coalesce(c.memo_text,'')) not like '%EARMARKED CONTRIBUTION:%'
                and upper(c.contributor_name) not like '%ACTBLUE%'
                and upper(c.contributor_name) not like '%WINRED%'
                and upper(c.contributor_name) not like '%DEMOCRACY ENGINE%'
               then c.amount else 0 end) as new_amount,
      count(*) filter (where c.is_contribution = true
                and upper(btrim(coalesce(c.memo_code,''))) <> 'X'
                and upper(coalesce(c.memo_text,'')) not like '%SEE BELOW%'
                and upper(coalesce(c.memo_text,'')) not like '%EARMARKED CONTRIBUTION:%'
                and upper(c.contributor_name) not like '%ACTBLUE%'
                and upper(c.contributor_name) not like '%WINRED%'
                and upper(c.contributor_name) not like '%DEMOCRACY ENGINE%') as new_txn_count,
      bool_or(upper(c.line_number) like '11D%') as touched_11d
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
  where touched_11d;

  select count(*) into v_hash_misses
  from _sc_affected a
  where not exists (select 1 from public.donors d where d.id = a.donor_id);

  update public.donors d
  set amount = a.new_amount::integer,
      transaction_count = a.new_txn_count::integer,
      is_contribution = (a.new_txn_count > 0)
  from _sc_affected a
  where d.id = a.donor_id
    and coalesce(d.is_conduit_org, false) = false
    and (d.amount <> a.new_amount::integer
         or coalesce(d.transaction_count, 0) <> a.new_txn_count::integer
         or d.is_contribution is distinct from (a.new_txn_count > 0));
  get diagnostics v_arm_b = row_count;

  if to_regprocedure('public.recalculate_candidate_coverage(text)') is not null then
    for rec in
      select distinct d.candidate_id
      from public.donors d
      join _sc_affected a on a.donor_id = d.id
      where d.candidate_id is not null
    loop
      perform public.recalculate_candidate_coverage(rec.candidate_id);
      v_candidates := v_candidates + 1;
    end loop;
  else
    raise notice 'recalculate_candidate_coverage(text) not found; skipped coverage recalc.';
  end if;

  if v_trigger_disabled then
    alter table public.donors enable trigger trg_recalc_coverage_on_donor_update;
  end if;

  raise notice 'candidate self-contribution backfill: % Line-11D rows set is_contribution=false (arm A), % donor rows recomputed (arm B), % identities had no matching donors row, % candidates recalculated. Remember: SELECT public.refresh_donor_consolidated_mv();',
    v_arm_a, v_arm_b, v_hash_misses, v_candidates;
end
$do$;
