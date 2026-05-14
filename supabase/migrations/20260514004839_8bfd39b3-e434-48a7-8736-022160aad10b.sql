create or replace function public.get_committee_cycles()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct cycle order by cycle desc), '{}')
  from public.committee_finance_rollups
  where cycle is not null;
$$;

grant execute on function public.get_committee_cycles() to anon, authenticated;