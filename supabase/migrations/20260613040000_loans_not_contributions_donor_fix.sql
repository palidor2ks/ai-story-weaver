-- Candidate loans (and other non-contribution receipts) must not appear as donors.
--
-- Problem
-- -------
-- import-fec-receipts-csv.classifyLineNumber returned isContribution=true for
-- EVERY line number (its final fall-through). FEC Line 13A is candidate loans
-- (incl. self-loans), Line 14 refunds/returns, Line 15 offsets, Line 17 other
-- federal receipts — none are donor contributions. So these rows were written
-- with is_contribution=true and aggregated into public.donors, where the donor
-- list (useCandidateDonors filters is_contribution=true) surfaced them as
-- "top donors".
--
-- Verified example: April McClain Delaney (M001232), 2026 cycle — three Line-13A
-- self-loans ($300k + $200k + $200k, contributor "MCCLAIN-DELANEY, APRIL",
-- typed Organization) made her #1 "top donor" at $300k. That money is
-- self-funding, not a donation. The importer is fixed to classify only Lines
-- 11 (contributions) and 12 (transfers) as is_contribution; everything else is
-- now false (mirrors fetch-fec-donors). This migration backfills existing data.
--
-- Fix (this file)
-- ---------------
-- Arm A: contributions.is_contribution := false for every row whose line_number
--        is not a Line 11 (contribution) or Line 12 (transfer) — idempotent.
-- Arm B: recompute public.donors (amount / transaction_count / is_contribution)
--        for exactly the donor identities that had at least one such non-11/12
--        line, by replicating the importers' SHA-256 donor-id in SQL (same as
--        20260612120000). A donor whose countable contribution lines now sum to
--        nothing gets is_contribution=false and is dropped from donor lists.
--        Identities whose hash finds no donors row are reported and left alone.
--
-- The per-row coverage trigger is disabled for the duration and
-- recalculate_candidate_coverage() runs once per touched candidate at the end.
-- Replay-safe: every UPDATE has an idempotent WHERE; re-running is a no-op.
-- Finance reconciliation is unaffected: get_contribution_totals keys its
-- itemized buckets off line_number (11/12/13...), not is_contribution.
-- Apply notes (owner): AFTER applying, refresh the donor explorer MVs separately
--   (REFRESH ... CONCURRENTLY is illegal inside this transaction):
--     SELECT public.refresh_donor_consolidated_mv();

set statement_timeout = 0;
set lock_timeout = '15s';

create extension if not exists pgcrypto with schema extensions;

-- A countable Line 11/12 contribution line (mirrors the donor aggregation rule:
-- not a memo-X informational line, not a SEE BELOW / EARMARKED conduit batch,
-- not a conduit org's own name, and is a real contribution line — not a loan).
-- Inlined predicate used by Arm B below.

do $do$
declare
  v_trigger_disabled boolean := false;
  v_arm_a bigint := 0;
  v_arm_b bigint := 0;
  v_hash_misses bigint := 0;
  v_candidates bigint := 0;
  rec record;
begin
  -- Skip cleanly on databases missing the expected schema (preview branches
  -- rebuilt purely from migrations may drift; the data fix must not fail them).
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
    raise notice 'loans-not-contributions backfill skipped: donors/contributions schema is missing expected columns; no rows changed.';
    return;
  end if;

  -- Arm A: only Line 11 (contributions) and Line 12 (transfers) are donor
  -- receipts. Everything else (13 loans, 14 refunds, 15 offsets, 17 other, ...)
  -- is not a contribution.
  with upd as (
    update public.contributions
    set is_contribution = false
    where line_number is not null
      and upper(line_number) not like '11%'
      and upper(line_number) not like '12%'
      and is_contribution is distinct from false
    returning 1
  )
  select count(*) into v_arm_a from upd;

  -- Disable the per-row coverage recalc trigger; recalc once per candidate later.
  if exists (
    select 1 from pg_trigger
    where tgname = 'trg_recalc_coverage_on_donor_update'
      and tgrelid = 'public.donors'::regclass
  ) then
    alter table public.donors disable trigger trg_recalc_coverage_on_donor_update;
    v_trigger_disabled := true;
  end if;

  -- Arm B: recompute donor rows for identities that had any non-11/12 line.
  -- Replicates generateDonorId() from the importers:
  --   Individual: lower(trim(name))|lower(trim(city))|upper(trim(state))|zip[0:5]|committee|cycle
  --   otherwise:  lower(trim(name))|upper(trim(state))|committee|cycle
  --   id = 'fec-' || first 32 hex chars of sha256(identity_key)
  create temp table _ln_affected on commit drop as
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
      -- Countable donor dollars: a real Line 11/12 contribution, net of the
      -- conduit / memo-X / SEE BELOW exclusions already enforced elsewhere.
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
      -- Did this identity include any now-non-contribution line? (Arm A target.)
      bool_or(c.line_number is not null
              and upper(c.line_number) not like '11%'
              and upper(c.line_number) not like '12%') as touched_by_arm_a
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
  where touched_by_arm_a;

  select count(*) into v_hash_misses
  from _ln_affected a
  where not exists (select 1 from public.donors d where d.id = a.donor_id);

  -- Conduit rows are finalized elsewhere (amount 0, is_conduit_org true) — don't
  -- resurrect them. A donor with no countable contribution dollars left is no
  -- longer a contributor: amount 0, is_contribution false (dropped from lists).
  update public.donors d
  set amount = a.new_amount::integer,
      transaction_count = a.new_txn_count::integer,
      is_contribution = (a.new_txn_count > 0)
  from _ln_affected a
  where d.id = a.donor_id
    and coalesce(d.is_conduit_org, false) = false
    and (d.amount <> a.new_amount::integer
         or coalesce(d.transaction_count, 0) <> a.new_txn_count::integer
         or d.is_contribution is distinct from (a.new_txn_count > 0));
  get diagnostics v_arm_b = row_count;

  -- One coverage recalc per touched candidate (replaces the disabled trigger).
  if to_regprocedure('public.recalculate_candidate_coverage(text)') is not null then
    for rec in
      select distinct d.candidate_id
      from public.donors d
      join _ln_affected a on a.donor_id = d.id
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

  raise notice 'loans-not-contributions backfill: % contributions rows set is_contribution=false (arm A), % donor rows recomputed (arm B), % affected identities had no matching donors row (left alone), % candidates recalculated. Remember: SELECT public.refresh_donor_consolidated_mv();',
    v_arm_a, v_arm_b, v_hash_misses, v_candidates;
end
$do$;
