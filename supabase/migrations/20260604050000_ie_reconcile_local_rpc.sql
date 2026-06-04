-- ie_reconcile_local(p_cycle): our-side aggregates for one independent-expenditure
-- cycle, consumed by the reconcile-independent-expenditures edge function to diff
-- stored data against the FEC API's authoritative Schedule E figures. Read-only.
-- SECURITY DEFINER so the service/anon caller can run it; touches only
-- public.independent_expenditures. Dates outside [cycle-2 .. cycle+1] are counted
-- as "bad" (filer typos like 3024/2030) and excluded from the reported range.

create or replace function public.ie_reconcile_local(p_cycle text)
returns table (
  rows bigint,
  distinct_transactions bigint,
  distinct_committees bigint,
  sum_amount numeric,
  support_amount numeric,
  oppose_amount numeric,
  bad_date_rows bigint,
  min_valid_date date,
  max_valid_date date
)
language sql
stable
security definer
set search_path to ''
as $function$
  with b as (
    select
      ((p_cycle::int - 2)::text || '-01-01')::date as lo,
      ((p_cycle::int + 1)::text || '-12-31')::date as hi
  )
  select
    count(*)::bigint,
    count(distinct e.fec_transaction_id)::bigint,
    count(distinct e.spending_committee_fec_id)::bigint,
    coalesce(sum(e.amount), 0)::numeric,
    coalesce(sum(e.amount) filter (where e.support_oppose_indicator = 'S'), 0)::numeric,
    coalesce(sum(e.amount) filter (where e.support_oppose_indicator = 'O'), 0)::numeric,
    count(*) filter (where e.expenditure_date is null or e.expenditure_date < b.lo or e.expenditure_date > b.hi)::bigint,
    min(e.expenditure_date) filter (where e.expenditure_date between b.lo and b.hi),
    max(e.expenditure_date) filter (where e.expenditure_date between b.lo and b.hi)
  from public.independent_expenditures e cross join b
  where e.cycle = p_cycle;
$function$;

grant execute on function public.ie_reconcile_local(text) to anon, authenticated, service_role;
