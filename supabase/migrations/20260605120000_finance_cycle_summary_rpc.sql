-- Per-cycle finance summary for the Coverage & Finance Dashboard.
--
-- Powers the "Cycle / FEC Totals / Local / Delta" chart so an admin can see, at
-- a glance, how much reconciliation work remains for each election cycle across
-- every *visible* state (hidden states are excluded to match the dashboard).
--
-- "Local" mirrors the exact per-row formula the dashboard already shows in its
-- Delta column (see AnswerCoveragePanel `localTotal`):
--   local_itemized
--   + GREATEST(local_transfers, fec_transfers)
--   + GREATEST(local_loans, fec_loans)
--   + GREATEST(local_other_receipts, fec_offsets + fec_other_receipts)
--   + fec_unitemized            (FEC-only, can't be imported locally)
--   + fec_candidate_contribution (FEC-only)
-- Delta = Local - FEC Total Receipts, so the summary reconciles with the table.
create or replace function public.get_finance_cycle_summary()
returns table (
  cycle text,
  reps integer,
  reps_with_fec integer,
  fec_total numeric,
  local_total numeric,
  delta numeric,
  delta_pct numeric,
  ok_count integer,
  warning_count integer,
  error_count integer
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden: admin role required';
  end if;

  return query
  with hidden as (
    select upper(state_code) as code from public.get_hidden_state_codes()
  ),
  rows as (
    select
      fr.cycle,
      fr.status,
      fr.fec_total_receipts,
      (
          coalesce(fr.local_itemized, 0)::numeric
        + greatest(coalesce(fr.local_transfers, 0), coalesce(fr.fec_transfers, 0))::numeric
        + greatest(coalesce(fr.local_loans, 0), coalesce(fr.fec_loans, 0))::numeric
        + greatest(
            coalesce(fr.local_other_receipts, 0),
            coalesce(fr.fec_offsets_to_operating_expenditures, 0) + coalesce(fr.fec_other_receipts, 0)
          )::numeric
        + coalesce(fr.fec_unitemized, 0)::numeric
        + coalesce(fr.fec_candidate_contribution, 0)::numeric
      ) as local_total
    from public.finance_reconciliation fr
    left join public.candidates c on c.id = fr.candidate_id
    where c.state is null or upper(c.state) not in (select code from hidden)
  )
  select
    r.cycle,
    count(*)::int,
    count(*) filter (where r.fec_total_receipts is not null)::int,
    sum(coalesce(r.fec_total_receipts, 0))::numeric,
    sum(r.local_total)::numeric,
    (sum(r.local_total) - sum(coalesce(r.fec_total_receipts, 0)))::numeric,
    case
      when sum(coalesce(r.fec_total_receipts, 0)) > 0
        then round(
          ((sum(r.local_total) - sum(coalesce(r.fec_total_receipts, 0)))
            / sum(coalesce(r.fec_total_receipts, 0))) * 100, 2)
      else null
    end,
    count(*) filter (where r.status = 'ok')::int,
    count(*) filter (where r.status = 'warning')::int,
    count(*) filter (where r.status = 'error')::int
  from rows r
  group by r.cycle
  order by r.cycle desc;
end;
$$;

comment on function public.get_finance_cycle_summary() is
  'Admin-only. Per-cycle FEC vs Local receipt totals (visible states only) for the dashboard summary chart.';
