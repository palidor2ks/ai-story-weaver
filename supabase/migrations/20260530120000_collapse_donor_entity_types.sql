-- Collapse public donor entity filters to two display categories:
-- Individual and Org/PAC (PAC + Organization).

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
STABLE SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_limit integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_offset integer := (greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_sort_by text := lower(coalesce(nullif(p_sort_by, ''), 'amount'));
  v_sort_order text := lower(coalesce(nullif(p_sort_order, ''), 'desc'));
  v_all_cycles boolean := (p_cycle IS NULL OR p_cycle = '' OR p_cycle = 'all');
  v_all_types boolean := (p_type IS NULL OR p_type = '' OR p_type = 'all');
  v_org_pac boolean := (p_type = 'Org/PAC');
  v_default_fast_path boolean := false;
BEGIN
  v_default_fast_path :=
    v_sort_by <> 'name'
    AND v_sort_order <> 'asc'
    AND v_all_types
    AND v_search IS NULL
    AND p_min_amount IS NULL;

  IF v_default_fast_path AND NOT v_all_cycles THEN
    RETURN QUERY
    SELECT
      dcmv.primary_id,
      dcmv.display_name,
      dcmv.cycle,
      dcmv.type::text,
      dcmv.types::text[],
      dcmv.total_amount,
      dcmv.total_transactions,
      dcmv.recipient_count,
      dcmv.is_consolidated,
      dcmv.name_variations,
      COALESCE((
        SELECT c.total_count
        FROM private.donor_consolidated_counts_mv c
        WHERE c.all_cycles = false AND c.cycle = p_cycle
      ), 0)::bigint AS total_count
    FROM private.donor_consolidated_mv dcmv
    WHERE dcmv.cycle = p_cycle
      AND dcmv.is_refund = false
    ORDER BY dcmv.total_amount DESC NULLS LAST, dcmv.display_name ASC NULLS LAST
    LIMIT v_limit OFFSET v_offset;
    RETURN;
  END IF;

  IF v_default_fast_path AND v_all_cycles THEN
    RETURN QUERY
    SELECT
      m.primary_id,
      m.display_name,
      'all'::text AS cycle,
      m.type::text,
      m.types::text[],
      m.total_amount,
      m.total_transactions,
      m.recipient_count,
      m.is_consolidated,
      m.name_variations,
      COALESCE((
        SELECT c.total_count
        FROM private.donor_consolidated_counts_mv c
        WHERE c.all_cycles = true AND c.cycle = 'all'
      ), 0)::bigint AS total_count
    FROM private.donor_consolidated_all_mv m
    WHERE m.is_refund = false
    ORDER BY m.total_amount DESC NULLS LAST, m.display_name ASC NULLS LAST
    LIMIT v_limit OFFSET v_offset;
    RETURN;
  END IF;

  IF NOT v_all_cycles THEN
    RETURN QUERY
    SELECT
      dcmv.primary_id,
      dcmv.display_name,
      dcmv.cycle,
      dcmv.type::text,
      dcmv.types::text[],
      dcmv.total_amount,
      dcmv.total_transactions,
      dcmv.recipient_count,
      dcmv.is_consolidated,
      dcmv.name_variations,
      count(*) OVER ()::bigint AS total_count
    FROM private.donor_consolidated_mv dcmv
    WHERE dcmv.cycle = p_cycle
      AND dcmv.is_refund = false
      AND (
        v_all_types
        OR (v_org_pac AND ('PAC' = ANY(dcmv.types::text[]) OR 'Organization' = ANY(dcmv.types::text[])))
        OR p_type = ANY(dcmv.types::text[])
      )
      AND (v_search IS NULL OR dcmv.search_text ILIKE '%' || v_search || '%')
      AND (p_min_amount IS NULL OR dcmv.total_amount >= p_min_amount)
    ORDER BY
      CASE WHEN v_sort_by = 'name' AND v_sort_order = 'desc' THEN dcmv.display_name END DESC NULLS LAST,
      CASE WHEN v_sort_by = 'name' AND v_sort_order <> 'desc' THEN dcmv.display_name END ASC NULLS LAST,
      CASE WHEN v_sort_by <> 'name' AND v_sort_order = 'asc' THEN dcmv.total_amount END ASC NULLS LAST,
      CASE WHEN v_sort_by <> 'name' AND v_sort_order <> 'asc' THEN dcmv.total_amount END DESC NULLS LAST,
      dcmv.display_name ASC NULLS LAST
    LIMIT v_limit OFFSET v_offset;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    m.primary_id,
    m.display_name,
    'all'::text AS cycle,
    m.type::text,
    m.types::text[],
    m.total_amount,
    m.total_transactions,
    m.recipient_count,
    m.is_consolidated,
    m.name_variations,
    count(*) OVER ()::bigint AS total_count
  FROM private.donor_consolidated_all_mv m
  WHERE m.is_refund = false
    AND (
      v_all_types
      OR (v_org_pac AND ('PAC' = ANY(m.types::text[]) OR 'Organization' = ANY(m.types::text[])))
      OR p_type = ANY(m.types::text[])
    )
    AND (v_search IS NULL OR m.search_text ILIKE '%' || v_search || '%')
    AND (p_min_amount IS NULL OR m.total_amount >= p_min_amount)
  ORDER BY
    CASE WHEN v_sort_by = 'name' AND v_sort_order = 'desc' THEN m.display_name END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'name' AND v_sort_order <> 'desc' THEN m.display_name END ASC NULLS LAST,
    CASE WHEN v_sort_by <> 'name' AND v_sort_order = 'asc' THEN m.total_amount END ASC NULLS LAST,
    CASE WHEN v_sort_by <> 'name' AND v_sort_order <> 'asc' THEN m.total_amount END DESC NULLS LAST,
    m.display_name ASC NULLS LAST
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_donors_by_name(
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
      and (
        p_type is null
        or p_type = 'all'
        or (p_type = 'Org/PAC' and d.type::text in ('PAC', 'Organization'))
        or d.type::text = p_type
      )
    limit 5000
  )
  select
    coalesce(m.dn, m.name)              as display_name,
    case
      when bool_or(m.t = 'Individual') then 'Individual'
      when bool_or(m.t in ('PAC', 'Organization')) then 'Org/PAC'
      else 'Unknown'
    end                                as type,
    sum(m.amount)::bigint              as total_amount,
    array_agg(distinct m.name)         as name_variations,
    (count(distinct m.name) > 1)       as is_consolidated
  from matches m
  group by 1
  order by total_amount desc
  limit p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_donors_paginated(integer, integer, text, text, text, text, text, bigint) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_donors_by_name(text, text, int) TO anon, authenticated;
