create or replace function public.get_committee_cycles()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with all_cycles as (
    select unnest(cycles) as cycle
    from public.candidate_committees
    where cycles is not null
    union
    select cycle
    from public.committee_finance_rollups
    where cycle is not null
  )
  select coalesce(array_agg(distinct cycle order by cycle desc), '{}')
  from all_cycles
  where cycle is not null and cycle <> '';
$$;
