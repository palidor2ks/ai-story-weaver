create extension if not exists pg_trgm;

create index if not exists idx_donors_display_name_trgm
  on public.donors using gin (display_name gin_trgm_ops);

create index if not exists idx_donors_name_trgm
  on public.donors using gin (name gin_trgm_ops);

create or replace function public.search_donors_by_name(
  p_search text,
  p_type   text default null,
  p_limit  int  default 50
)
returns table (
  display_name      text,
  type              text,
  total_amount      bigint,
  name_variations   text[],
  is_consolidated   boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with matches as (
    select d.display_name as dn, d.type::text as t, d.amount, d.name
    from public.donors d
    where (d.display_name ilike '%' || p_search || '%'
           or d.name ilike '%' || p_search || '%')
      and (p_type is null or p_type = 'all' or d.type::text = p_type)
    limit 5000
  )
  select
    coalesce(m.dn, m.name)              as display_name,
    m.t                                 as type,
    sum(m.amount)::bigint               as total_amount,
    array_agg(distinct m.name)          as name_variations,
    (count(distinct m.name) > 1)        as is_consolidated
  from matches m
  group by 1, 2
  order by total_amount desc
  limit p_limit;
$$;

grant execute on function public.search_donors_by_name(text, text, int)
  to anon, authenticated;
