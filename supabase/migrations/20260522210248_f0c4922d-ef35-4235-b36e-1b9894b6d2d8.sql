CREATE OR REPLACE FUNCTION public.get_donors_paginated(p_page integer DEFAULT 1, p_page_size integer DEFAULT 50, p_sort_by text DEFAULT 'amount'::text, p_sort_order text DEFAULT 'desc'::text, p_cycle text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_min_amount bigint DEFAULT NULL::bigint)
 RETURNS TABLE(primary_id text, display_name text, cycle text, type text, types text[], total_amount bigint, total_transactions bigint, recipient_count bigint, is_consolidated boolean, name_variations text[], total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_limit integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_offset integer := (greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_sort_order text := lower(coalesce(p_sort_order, 'desc'));
  v_all_cycles boolean := (p_cycle IS NULL OR p_cycle = '' OR p_cycle = 'all');
BEGIN
  IF NOT v_all_cycles THEN
    RETURN QUERY
    WITH filtered AS (
      SELECT dcmv.*
      FROM private.donor_consolidated_mv dcmv
      WHERE dcmv.cycle = p_cycle
        AND (p_type IS NULL OR p_type = '' OR p_type = 'all' OR p_type = ANY(dcmv.types::text[]))
        AND (v_search IS NULL OR dcmv.search_text ILIKE '%' || v_search || '%')
        AND (p_min_amount IS NULL OR dcmv.total_amount >= p_min_amount)
        AND NOT EXISTS (
          SELECT 1 FROM public.vendor_refund_organizations v
          WHERE v.is_active
            AND upper(dcmv.display_name) LIKE '%' || upper(v.name) || '%'
        )
    ), counted AS (
      SELECT count(*)::bigint AS total_count FROM filtered
    )
    SELECT f.primary_id, f.display_name, f.cycle, f.type::text, f.types::text[], f.total_amount,
           f.total_transactions, f.recipient_count, f.is_consolidated, f.name_variations, c.total_count
    FROM filtered f CROSS JOIN counted c
    ORDER BY
      CASE WHEN p_sort_by = 'name' AND v_sort_order = 'desc' THEN f.display_name END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'name' AND v_sort_order <> 'desc' THEN f.display_name END ASC NULLS LAST,
      CASE WHEN p_sort_by <> 'name' AND v_sort_order = 'asc'  THEN f.total_amount END ASC NULLS LAST,
      CASE WHEN p_sort_by <> 'name' AND v_sort_order <> 'asc' THEN f.total_amount END DESC NULLS LAST,
      f.display_name ASC NULLS LAST
    LIMIT v_limit OFFSET v_offset;
    RETURN;
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT m.*
    FROM private.donor_consolidated_all_mv m
    WHERE (p_type IS NULL OR p_type = '' OR p_type = 'all' OR p_type = ANY(m.types::text[]))
      AND (v_search IS NULL OR m.search_text ILIKE '%' || v_search || '%')
      AND (p_min_amount IS NULL OR m.total_amount >= p_min_amount)
      AND NOT EXISTS (
        SELECT 1 FROM public.vendor_refund_organizations v
        WHERE v.is_active
          AND upper(m.display_name) LIKE '%' || upper(v.name) || '%'
      )
  ), counted AS (
    SELECT count(*)::bigint AS total_count FROM filtered
  )
  SELECT f.primary_id, f.display_name, 'all'::text AS cycle, f.type::text, f.types::text[], f.total_amount,
         f.total_transactions, f.recipient_count, f.is_consolidated, f.name_variations, c.total_count
  FROM filtered f CROSS JOIN counted c
  ORDER BY
    CASE WHEN p_sort_by = 'name' AND v_sort_order = 'desc' THEN f.display_name END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'name' AND v_sort_order <> 'desc' THEN f.display_name END ASC NULLS LAST,
    CASE WHEN p_sort_by <> 'name' AND v_sort_order = 'asc'  THEN f.total_amount END ASC NULLS LAST,
    CASE WHEN p_sort_by <> 'name' AND v_sort_order <> 'asc' THEN f.total_amount END DESC NULLS LAST,
    f.display_name ASC NULLS LAST
  LIMIT v_limit OFFSET v_offset;
END;
$function$;