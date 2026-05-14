create schema if not exists private;

drop materialized view if exists private.donor_consolidated_mv;

create materialized view private.donor_consolidated_mv as
select
  md5(coalesce(d.cycle, '') || '|' || coalesce(coalesce(d.display_name, d.name), '')) as row_id,
  d.cycle,
  coalesce(d.display_name, d.name) as display_name,
  min(d.id) as primary_id,
  array_agg(distinct d.type order by d.type) as types,
  (array_agg(d.type order by d.amount desc nulls last))[1] as type,
  array_agg(distinct d.name order by d.name) as name_variations,
  sum(d.amount)::bigint as total_amount,
  sum(coalesce(d.transaction_count, 1))::bigint as total_transactions,
  count(distinct d.candidate_id)::bigint as recipient_count,
  count(distinct d.name) > 1 or coalesce(d.display_name, d.name) <> min(d.name) as is_consolidated,
  coalesce(d.display_name, d.name) || ' ' || string_agg(distinct d.name, ' ' order by d.name) as search_text
from public.donors d
group by d.cycle, coalesce(d.display_name, d.name);

create unique index donor_consolidated_mv_row_id_idx
  on private.donor_consolidated_mv (row_id);

create index donor_consolidated_mv_total_amount_idx
  on private.donor_consolidated_mv (total_amount desc nulls last);

create index donor_consolidated_mv_cycle_amount_idx
  on private.donor_consolidated_mv (cycle, total_amount desc nulls last);

create index donor_consolidated_mv_display_name_idx
  on private.donor_consolidated_mv (display_name);

create index donor_consolidated_mv_cycle_display_name_idx
  on private.donor_consolidated_mv (cycle, display_name);

create index donor_consolidated_mv_types_idx
  on private.donor_consolidated_mv using gin (types);

create index donor_consolidated_mv_search_text_trgm_idx
  on private.donor_consolidated_mv using gin (search_text gin_trgm_ops);

grant usage on schema private to authenticated, service_role;
grant select on private.donor_consolidated_mv to authenticated, service_role;
revoke all on private.donor_consolidated_mv from anon;

drop materialized view if exists public.donor_consolidated_mv;

create or replace function public.get_donor_cycles()
returns table(cycle text)
language sql
stable
security invoker
set search_path = public, private
as $$
  select distinct dcmv.cycle::text
  from private.donor_consolidated_mv dcmv
  where dcmv.cycle is not null
  order by dcmv.cycle::text desc;
$$;

revoke all on function public.get_donor_cycles() from public, anon;
grant execute on function public.get_donor_cycles() to authenticated, service_role;

create or replace function public.get_donors_paginated(
  p_page integer default 1,
  p_page_size integer default 50,
  p_sort_by text default 'amount',
  p_sort_order text default 'desc',
  p_cycle text default null,
  p_type text default null,
  p_search text default null,
  p_min_amount bigint default null
)
returns table(
  primary_id text,
  display_name text,
  cycle text,
  type text,
  types text[],
  total_amount bigint,
  total_transactions bigint,
  recipient_count bigint,
  is_consolidated boolean,
  name_variations text[],
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = public, private
as $$
declare
  v_limit integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_offset integer := (greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_sort_order text := lower(coalesce(p_sort_order, 'desc'));
begin
  if p_sort_by = 'name' and v_sort_order = 'desc' then
    return query
    with filtered as (
      select dcmv.*
      from private.donor_consolidated_mv dcmv
      where (p_cycle is null or p_cycle = '' or p_cycle = 'all' or dcmv.cycle = p_cycle)
        and (p_type is null or p_type = '' or p_type = 'all' or p_type = any(dcmv.types::text[]))
        and (v_search is null or dcmv.search_text ilike '%' || v_search || '%')
        and (p_min_amount is null or dcmv.total_amount >= p_min_amount)
    ), counted as (
      select count(*)::bigint as total_count from filtered
    )
    select f.primary_id, f.display_name, f.cycle, f.type::text, f.types::text[], f.total_amount,
           f.total_transactions, f.recipient_count, f.is_consolidated, f.name_variations, c.total_count
    from filtered f cross join counted c
    order by f.display_name desc nulls last, f.total_amount desc nulls last
    limit v_limit offset v_offset;
  elsif p_sort_by = 'name' then
    return query
    with filtered as (
      select dcmv.*
      from private.donor_consolidated_mv dcmv
      where (p_cycle is null or p_cycle = '' or p_cycle = 'all' or dcmv.cycle = p_cycle)
        and (p_type is null or p_type = '' or p_type = 'all' or p_type = any(dcmv.types::text[]))
        and (v_search is null or dcmv.search_text ilike '%' || v_search || '%')
        and (p_min_amount is null or dcmv.total_amount >= p_min_amount)
    ), counted as (
      select count(*)::bigint as total_count from filtered
    )
    select f.primary_id, f.display_name, f.cycle, f.type::text, f.types::text[], f.total_amount,
           f.total_transactions, f.recipient_count, f.is_consolidated, f.name_variations, c.total_count
    from filtered f cross join counted c
    order by f.display_name asc nulls last, f.total_amount desc nulls last
    limit v_limit offset v_offset;
  elsif v_sort_order = 'asc' then
    return query
    with filtered as (
      select dcmv.*
      from private.donor_consolidated_mv dcmv
      where (p_cycle is null or p_cycle = '' or p_cycle = 'all' or dcmv.cycle = p_cycle)
        and (p_type is null or p_type = '' or p_type = 'all' or p_type = any(dcmv.types::text[]))
        and (v_search is null or dcmv.search_text ilike '%' || v_search || '%')
        and (p_min_amount is null or dcmv.total_amount >= p_min_amount)
    ), counted as (
      select count(*)::bigint as total_count from filtered
    )
    select f.primary_id, f.display_name, f.cycle, f.type::text, f.types::text[], f.total_amount,
           f.total_transactions, f.recipient_count, f.is_consolidated, f.name_variations, c.total_count
    from filtered f cross join counted c
    order by f.total_amount asc nulls last, f.display_name asc nulls last
    limit v_limit offset v_offset;
  else
    return query
    with filtered as (
      select dcmv.*
      from private.donor_consolidated_mv dcmv
      where (p_cycle is null or p_cycle = '' or p_cycle = 'all' or dcmv.cycle = p_cycle)
        and (p_type is null or p_type = '' or p_type = 'all' or p_type = any(dcmv.types::text[]))
        and (v_search is null or dcmv.search_text ilike '%' || v_search || '%')
        and (p_min_amount is null or dcmv.total_amount >= p_min_amount)
    ), counted as (
      select count(*)::bigint as total_count from filtered
    )
    select f.primary_id, f.display_name, f.cycle, f.type::text, f.types::text[], f.total_amount,
           f.total_transactions, f.recipient_count, f.is_consolidated, f.name_variations, c.total_count
    from filtered f cross join counted c
    order by f.total_amount desc nulls last, f.display_name asc nulls last
    limit v_limit offset v_offset;
  end if;
end;
$$;

revoke all on function public.get_donors_paginated(integer, integer, text, text, text, text, text, bigint) from public, anon;
grant execute on function public.get_donors_paginated(integer, integer, text, text, text, text, text, bigint) to authenticated, service_role;