-- 1) Precomputed all-cycles donor summary (single-pass aggregation)
DROP MATERIALIZED VIEW IF EXISTS private.donor_consolidated_all_mv;

CREATE MATERIALIZED VIEW private.donor_consolidated_all_mv AS
WITH base AS (
  SELECT
    dcmv.display_name,
    dcmv.type,
    dcmv.primary_id,
    dcmv.total_amount,
    dcmv.total_transactions,
    dcmv.recipient_count,
    dcmv.is_consolidated,
    dcmv.types,
    dcmv.name_variations,
    dcmv.search_text
  FROM private.donor_consolidated_mv dcmv
),
agg AS (
  SELECT
    b.display_name,
    b.type,
    sum(b.total_amount)::bigint        AS total_amount,
    sum(b.total_transactions)::bigint  AS total_transactions,
    sum(b.recipient_count)::bigint     AS recipient_count,
    bool_or(b.is_consolidated) OR count(*) > 1 AS is_consolidated,
    (array_agg(b.primary_id ORDER BY b.total_amount DESC NULLS LAST))[1] AS primary_id,
    array_remove(array_agg(DISTINCT nv), NULL) AS name_variations,
    array_remove(array_agg(DISTINCT t),  NULL) AS types_text,
    string_agg(DISTINCT b.search_text, ' ') AS search_text
  FROM base b
  LEFT JOIN LATERAL unnest(b.name_variations) AS nv ON true
  LEFT JOIN LATERAL unnest(b.types::text[])   AS t  ON true
  GROUP BY b.display_name, b.type
)
SELECT
  primary_id,
  display_name,
  type,
  types_text::donor_type[] AS types,
  total_amount,
  total_transactions,
  recipient_count,
  is_consolidated,
  name_variations,
  search_text
FROM agg;

CREATE UNIQUE INDEX donor_consolidated_all_mv_pk
  ON private.donor_consolidated_all_mv (display_name, type);
CREATE INDEX donor_consolidated_all_mv_amount_idx
  ON private.donor_consolidated_all_mv (total_amount DESC NULLS LAST);

-- 2) Refresh function: include the new MV
CREATE OR REPLACE FUNCTION private.refresh_donor_consolidated_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW private.donor_consolidated_mv;
  REFRESH MATERIALIZED VIEW private.donor_consolidated_all_mv;
END;
$$;

-- 3) Rewrite paginated function: all-cycles branch reads from precomputed MV
CREATE OR REPLACE FUNCTION public.get_donors_paginated(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_sort_by text DEFAULT 'amount',
  p_sort_order text DEFAULT 'desc',
  p_cycle text DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_min_amount bigint DEFAULT NULL
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