-- ie_reconcile_local(p_cycle): our-side aggregates for one independent-expenditure
-- cycle, consumed by the reconcile-independent-expenditures edge function to diff
-- stored data against the FEC API's authoritative Schedule E figures. Read-only.
--
-- Exclusion-aware: rows from committees in ie_excluded_committees (junk / prank
-- filings) are reported separately and kept OUT of the headline totals, matching
-- what the app actually displays. statement_timeout is raised so the larger
-- cycles don't trip PostgREST's per-role default. Out-of-range expenditure dates
-- (filer typos like 3024/2030) are counted and excluded from the reported range.
-- SECURITY DEFINER; reads only public.independent_expenditures + ie_excluded_committees.

-- Drop first: the OUT-parameter set has changed over revisions, and CREATE OR
-- REPLACE cannot change a function's return type.
drop function if exists public.ie_reconcile_local(text);

create or replace function public.ie_reconcile_local(p_cycle text)
returns table (
  rows bigint,
  distinct_transactions bigint,
  distinct_committees bigint,
  sum_amount numeric,
  support_amount numeric,
  oppose_amount numeric,
  excluded_rows bigint,
  excluded_amount numeric,
  bad_date_rows bigint,
  min_valid_date date,
  max_valid_date date
)
language sql
stable
security definer
set search_path to ''
set statement_timeout to '120s'
as $function$
  with b as (
    select
      ((p_cycle::int - 2)::text || '-01-01')::date as lo,
      ((p_cycle::int + 1)::text || '-12-31')::date as hi
  ),
  src as (
    select
      e.amount,
      e.support_oppose_indicator,
      e.fec_transaction_id,
      e.spending_committee_fec_id,
      e.expenditure_date,
      (e.spending_committee_fec_id in (select x.fec_committee_id from public.ie_excluded_committees x)) as is_excluded
    from public.independent_expenditures e
    where e.cycle = p_cycle
  )
  select
    count(*) filter (where not s.is_excluded)::bigint,
    count(distinct s.fec_transaction_id) filter (where not s.is_excluded)::bigint,
    count(distinct s.spending_committee_fec_id) filter (where not s.is_excluded)::bigint,
    coalesce(sum(s.amount) filter (where not s.is_excluded), 0)::numeric,
    coalesce(sum(s.amount) filter (where not s.is_excluded and s.support_oppose_indicator = 'S'), 0)::numeric,
    coalesce(sum(s.amount) filter (where not s.is_excluded and s.support_oppose_indicator = 'O'), 0)::numeric,
    count(*) filter (where s.is_excluded)::bigint,
    coalesce(sum(s.amount) filter (where s.is_excluded), 0)::numeric,
    count(*) filter (where not s.is_excluded and (s.expenditure_date is null or s.expenditure_date < b.lo or s.expenditure_date > b.hi))::bigint,
    min(s.expenditure_date) filter (where not s.is_excluded and s.expenditure_date between b.lo and b.hi),
    max(s.expenditure_date) filter (where not s.is_excluded and s.expenditure_date between b.lo and b.hi)
  from src s cross join b;
$function$;

grant execute on function public.ie_reconcile_local(text) to anon, authenticated, service_role;
