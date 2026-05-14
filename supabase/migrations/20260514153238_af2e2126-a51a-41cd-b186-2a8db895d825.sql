CREATE OR REPLACE FUNCTION public.get_donors_paginated(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_sort_by text DEFAULT 'amount'::text,
  p_sort_order text DEFAULT 'desc'::text,
  p_cycle text DEFAULT NULL::text,
  p_type text DEFAULT NULL::text,
  p_search text DEFAULT NULL::text,
  p_min_amount bigint DEFAULT NULL::bigint
)
RETURNS TABLE(
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
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'private'
AS $function$
declare
  v_limit integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_offset integer := (greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_sort_order text := lower(coalesce(p_sort_order, 'desc'));
  v_all_cycles boolean := (p_cycle is null or p_cycle = '' or p_cycle = 'all');
begin
  -- When a specific cycle is requested, return per-cycle rows (existing behavior).
  if not v_all_cycles then
    return query
    with filtered as (
      select dcmv.*
      from private.donor_consolidated_mv dcmv
      where dcmv.cycle = p_cycle
        and (p_type is null or p_type = '' or p_type = 'all' or p_type = any(dcmv.types::text[]))
        and (v_search is null or dcmv.search_text ilike '%' || v_search || '%')
        and (p_min_amount is null or dcmv.total_amount >= p_min_amount)
    ), counted as (
      select count(*)::bigint as total_count from filtered
    )
    select f.primary_id, f.display_name, f.cycle, f.type::text, f.types::text[], f.total_amount,
           f.total_transactions, f.recipient_count, f.is_consolidated, f.name_variations, c.total_count
    from filtered f cross join counted c
    order by
      case when p_sort_by = 'name' and v_sort_order = 'desc' then f.display_name end desc nulls last,
      case when p_sort_by = 'name' and v_sort_order <> 'desc' then f.display_name end asc nulls last,
      case when p_sort_by <> 'name' and v_sort_order = 'asc'  then f.total_amount end asc nulls last,
      case when p_sort_by <> 'name' and v_sort_order <> 'asc' then f.total_amount end desc nulls last,
      f.display_name asc nulls last
    limit v_limit offset v_offset;
    return;
  end if;

  -- All-cycles aggregation: collapse to one row per (display_name, type).
  -- Note: recipient_count summed across cycles may slightly over-count distinct
  -- recipients that appear in multiple cycles. Acceptable approximation.
  return query
  with filtered as (
    select dcmv.*
    from private.donor_consolidated_mv dcmv
    where (p_type is null or p_type = '' or p_type = 'all' or p_type = any(dcmv.types::text[]))
      and (v_search is null or dcmv.search_text ilike '%' || v_search || '%')
  ),
  ranked as (
    select f.*,
           row_number() over (partition by f.display_name, f.type order by f.total_amount desc nulls last) as rn
    from filtered f
  ),
  aggregated as (
    select
      f.display_name,
      f.type::text as type,
      sum(f.total_amount)::bigint as total_amount,
      sum(f.total_transactions)::bigint as total_transactions,
      sum(f.recipient_count)::bigint as recipient_count,
      bool_or(f.is_consolidated) or count(*) > 1 as is_consolidated,
      (
        select array_agg(distinct nv)
        from (
          select unnest(f2.name_variations) as nv
          from filtered f2
          where f2.display_name = f.display_name and f2.type = f.type
        ) s
        where nv is not null
      ) as name_variations,
      (
        select array_agg(distinct t)
        from (
          select unnest(f3.types::text[]) as t
          from filtered f3
          where f3.display_name = f.display_name and f3.type = f.type
        ) s
        where t is not null
      ) as types,
      (
        select r.primary_id from ranked r
        where r.display_name = f.display_name and r.type = f.type and r.rn = 1
      ) as primary_id
    from filtered f
    group by f.display_name, f.type
  ),
  filtered_agg as (
    select * from aggregated a
    where (p_min_amount is null or a.total_amount >= p_min_amount)
  ),
  counted as (
    select count(*)::bigint as total_count from filtered_agg
  )
  select fa.primary_id, fa.display_name, 'all'::text as cycle, fa.type, fa.types, fa.total_amount,
         fa.total_transactions, fa.recipient_count, fa.is_consolidated, fa.name_variations, c.total_count
  from filtered_agg fa cross join counted c
  order by
    case when p_sort_by = 'name' and v_sort_order = 'desc' then fa.display_name end desc nulls last,
    case when p_sort_by = 'name' and v_sort_order <> 'desc' then fa.display_name end asc nulls last,
    case when p_sort_by <> 'name' and v_sort_order = 'asc'  then fa.total_amount end asc nulls last,
    case when p_sort_by <> 'name' and v_sort_order <> 'asc' then fa.total_amount end desc nulls last,
    fa.display_name asc nulls last
  limit v_limit offset v_offset;
end;
$function$;