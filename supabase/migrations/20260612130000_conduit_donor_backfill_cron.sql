-- Conduit/memo-X donor backfill — batched by committee via pg_cron.
--
-- Context
-- -------
-- The earmark rollup RPC (get_candidate_earmark_rollups) was deployed via
-- 20260612120000_conduit_memox_donor_backfill_and_earmark_rollups.sql (DDL applied
-- separately — the DO block backfill was never run due to work_mem=3.5MB causing
-- multi-minute disk spill on the 11.6M-row full-table GROUP BY).
--
-- This migration creates a per-committee batched backfill procedure that avoids the
-- full-table scan by iterating over committees with excluded lines (index-seeked via
-- idx_contributions_committee). 4,635 affected committees × ~10ms = ~46s total —
-- within the 120s statement_timeout.
--
-- The procedure:
--   Arm 1: zero conduit-named donor rows (ACTBLUE/WINRED/DEMOCRACY ENGINE).
--   Arm 2: per-committee loop — recompute amount/transaction_count from contributions
--          for donors whose groups contain at least one excluded line (memo-X, SEE BELOW,
--          EARMARKED CONTRIBUTION:, or conduit-named contributor).
--   Disables trg_recalc_coverage_on_donor_update for the duration, re-enables at end.
--   Coverage recalc: deferred to the 15-min admin stats cron (not in this proc).
--   Self-unschedules from pg_cron on successful completion.
--
-- Replay-safe: idempotent guards on both arms.

-- ---------------------------------------------------------------------------
-- 1) Backfill procedure
-- ---------------------------------------------------------------------------
create or replace procedure public._run_conduit_backfill_v2()
language plpgsql
set search_path = public
as $$
declare
  v_trigger_disabled boolean := false;
  v_arm1 bigint := 0;
  v_arm2_committees bigint := 0;
  v_arm2_donors bigint := 0;
  v_job_id bigint;
  comm_rec record;
  upd_count bigint;
begin
  -- Schema guard: skip on databases missing expected columns
  if exists (
    select 1 from unnest(array['id','name','amount','transaction_count','is_conduit_org','candidate_id']) as req(col)
    where not exists (
      select 1 from information_schema.columns ic
      where ic.table_schema = 'public' and ic.table_name = 'donors' and ic.column_name = req.col
    )
  ) then
    raise notice 'conduit backfill v2: donors schema missing expected columns, skipping.';
    return;
  end if;

  -- Disable the per-row coverage trigger for the duration (it would fire once per
  -- updated donor row — potentially 100K+ invocations — instead of running once per
  -- candidate at the end). Coverage will update via the 15-min admin stats cron.
  if exists (
    select 1 from pg_trigger
    where tgname = 'trg_recalc_coverage_on_donor_update'
      and tgrelid = 'public.donors'::regclass
  ) then
    execute 'alter table public.donors disable trigger trg_recalc_coverage_on_donor_update';
    v_trigger_disabled := true;
  end if;

  -- ------------------------------------------------------------------
  -- Arm 1: conduit rows carry no dollars and no transaction count, ever.
  -- ------------------------------------------------------------------
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
    returning 1
  )
  select count(*) into v_arm1 from upd;

  -- ------------------------------------------------------------------
  -- Arm 2: per-committee recompute of memo-X contaminated donor amounts.
  -- Iterates only over committees that have at least one excluded line
  -- (uses idx_contributions_memo_code and idx_contributions_committee).
  -- ------------------------------------------------------------------
  for comm_rec in
    select distinct recipient_committee_id as committee_id
    from public.contributions
    where memo_code = 'X'
       or upper(coalesce(contributor_name, '')) like '%ACTBLUE%'
       or upper(coalesce(contributor_name, '')) like '%WINRED%'
       or upper(coalesce(contributor_name, '')) like '%DEMOCRACY ENGINE%'
  loop
    with contrib_groups as (
      select
        case when c.contributor_type = 'Individual' then
          'fec-' || left(encode(extensions.digest(
            lower(btrim(c.contributor_name)) || '|' ||
            lower(btrim(coalesce(c.contributor_city, ''))) || '|' ||
            upper(btrim(coalesce(c.contributor_state, ''))) || '|' ||
            left(coalesce(c.contributor_zip, ''), 5) || '|' ||
            c.recipient_committee_id || '|' || c.cycle,
          'sha256'), 'hex'), 32)
        else
          'fec-' || left(encode(extensions.digest(
            lower(btrim(c.contributor_name)) || '|' ||
            upper(btrim(coalesce(c.contributor_state, ''))) || '|' ||
            c.recipient_committee_id || '|' || c.cycle,
          'sha256'), 'hex'), 32)
        end as donor_id,
        sum(case
          when upper(btrim(coalesce(c.memo_code, ''))) <> 'X'
            and upper(coalesce(c.memo_text, '')) not like '%SEE BELOW%'
            and upper(coalesce(c.memo_text, '')) not like '%EARMARKED CONTRIBUTION:%'
            and upper(c.contributor_name) not like '%ACTBLUE%'
            and upper(c.contributor_name) not like '%WINRED%'
            and upper(c.contributor_name) not like '%DEMOCRACY ENGINE%'
          then c.amount else 0 end
        ) as new_amount,
        count(*) filter (where
          upper(btrim(coalesce(c.memo_code, ''))) <> 'X'
          and upper(coalesce(c.memo_text, '')) not like '%SEE BELOW%'
          and upper(coalesce(c.memo_text, '')) not like '%EARMARKED CONTRIBUTION:%'
          and upper(c.contributor_name) not like '%ACTBLUE%'
          and upper(c.contributor_name) not like '%WINRED%'
          and upper(c.contributor_name) not like '%DEMOCRACY ENGINE%'
        ) as new_count,
        -- Only update groups that have at least one excluded line
        bool_or(
          upper(btrim(coalesce(c.memo_code, ''))) = 'X'
          or upper(coalesce(c.memo_text, '')) like '%SEE BELOW%'
          or upper(coalesce(c.memo_text, '')) like '%EARMARKED CONTRIBUTION:%'
          or upper(c.contributor_name) like '%ACTBLUE%'
          or upper(c.contributor_name) like '%WINRED%'
          or upper(c.contributor_name) like '%DEMOCRACY ENGINE%'
        ) as has_excluded
      from public.contributions c
      where c.recipient_committee_id = comm_rec.committee_id
        and c.contributor_name is not null
        and c.cycle is not null
      group by 1
    )
    update public.donors d
    set amount = cg.new_amount::integer,
        transaction_count = cg.new_count::integer
    from contrib_groups cg
    where cg.has_excluded
      and d.id = cg.donor_id
      and not coalesce(d.is_conduit_org, false)   -- Arm 1 already finalized conduit rows
      and (d.amount::integer <> cg.new_amount::integer
           or coalesce(d.transaction_count, 0) <> cg.new_count::integer);

    get diagnostics upd_count = row_count;
    v_arm2_donors := v_arm2_donors + upd_count;
    v_arm2_committees := v_arm2_committees + 1;
  end loop;

  -- Re-enable trigger
  if v_trigger_disabled then
    execute 'alter table public.donors enable trigger trg_recalc_coverage_on_donor_update';
  end if;

  raise notice 'conduit backfill v2 complete: % conduit rows zeroed (arm1), % committees processed / % donor rows recomputed (arm2). Run SELECT public.refresh_donor_consolidated_mv(); next.',
    v_arm1, v_arm2_committees, v_arm2_donors;

  -- Self-unschedule from pg_cron
  select jobid into v_job_id from cron.job where jobname = 'conduit-backfill-v2' limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
    raise notice 'conduit-backfill-v2 cron job unscheduled (jobid %).', v_job_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Schedule as a one-time pg_cron job (runs every minute, self-unschedules)
-- ---------------------------------------------------------------------------
-- statement_timeout = 0 prevents Supabase's 120s per-statement limit from
-- killing the procedure mid-way.
select cron.schedule(
  'conduit-backfill-v2',
  '* * * * *',
  'set statement_timeout = 0; set lock_timeout = ''30s''; call public._run_conduit_backfill_v2();'
);
