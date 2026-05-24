CREATE OR REPLACE FUNCTION public.refresh_donor_consolidated_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
SET statement_timeout TO '600000'
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY private.donor_consolidated_mv;
  REFRESH MATERIALIZED VIEW CONCURRENTLY private.donor_consolidated_all_mv;
  REFRESH MATERIALIZED VIEW CONCURRENTLY private.donor_consolidated_counts_mv;
END;
$function$;

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
  v_default_fast_path boolean := false;
BEGIN
  v_default_fast_path :=
    v_sort_by <> 'name'
    AND v_sort_order <> 'asc'
    AND (p_type IS NULL OR p_type = '' OR p_type = 'all')
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
      AND (p_type IS NULL OR p_type = '' OR p_type = 'all' OR p_type = ANY(dcmv.types::text[]))
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
    AND (p_type IS NULL OR p_type = '' OR p_type = 'all' OR p_type = ANY(m.types::text[]))
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