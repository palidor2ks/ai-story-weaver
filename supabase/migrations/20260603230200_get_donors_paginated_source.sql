-- Donor explorer RPC + search helpers: make them source-aware (federal + NJ state).
--
-- get_donors_paginated() gains:
--   * a new trailing parameter `p_source` (NULL/'all' | 'federal' | 'state'|'nj')
--   * three new output columns: federal_amount, state_amount, sources
--
-- Jurisdiction semantics: when p_source is 'federal' or 'state', the list is filtered to
-- donors active in that arena AND ranked/sized by that arena's amount (the card still
-- shows the federal/state split). When p_source is NULL/'all', behavior is the combined
-- total, identical in spirit to before.
--
-- The existing 8-argument named call still resolves because p_source defaults to NULL,
-- so the current frontend keeps working until the UI is updated.

DROP FUNCTION IF EXISTS public.get_donors_paginated(integer, integer, text, text, text, text, text, bigint);

CREATE OR REPLACE FUNCTION public.get_donors_paginated(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_sort_by text DEFAULT 'amount'::text,
  p_sort_order text DEFAULT 'desc'::text,
  p_cycle text DEFAULT NULL::text,
  p_type text DEFAULT NULL::text,
  p_search text DEFAULT NULL::text,
  p_min_amount bigint DEFAULT NULL::bigint,
  p_source text DEFAULT NULL::text
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
  total_count bigint,
  federal_amount bigint,
  state_amount bigint,
  sources text[]
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
  v_source text := CASE
                     WHEN p_source ILIKE 'fed%' THEN 'federal'
                     WHEN p_source ILIKE 'state' OR p_source ILIKE 'nj%' THEN 'state'
                     ELSE NULL
                   END;
  v_all_sources boolean := (p_source IS NULL OR p_source = '' OR lower(p_source) = 'all' OR v_source IS NULL);
  v_default_fast_path boolean := false;
BEGIN
  v_default_fast_path :=
    v_sort_by <> 'name'
    AND v_sort_order <> 'asc'
    AND v_all_types
    AND v_all_sources
    AND v_search IS NULL
    AND p_min_amount IS NULL;

  -- Fast path: single cycle, all types, all sources, default sort.
  IF v_default_fast_path AND NOT v_all_cycles THEN
    RETURN QUERY
    SELECT
      dcmv.primary_id, dcmv.display_name, dcmv.cycle, dcmv.type::text, dcmv.types::text[],
      dcmv.total_amount, dcmv.total_transactions, dcmv.recipient_count,
      dcmv.is_consolidated, dcmv.name_variations,
      COALESCE((SELECT c.total_count FROM private.donor_consolidated_counts_mv c
                 WHERE c.all_cycles = false AND c.cycle = p_cycle), 0)::bigint AS total_count,
      dcmv.federal_amount, dcmv.state_amount, dcmv.sources
    FROM private.donor_consolidated_mv dcmv
    WHERE dcmv.cycle = p_cycle AND dcmv.is_refund = false
    ORDER BY dcmv.total_amount DESC NULLS LAST, dcmv.display_name ASC NULLS LAST
    LIMIT v_limit OFFSET v_offset;
    RETURN;
  END IF;

  -- Fast path: all cycles, all types, all sources, default sort.
  IF v_default_fast_path AND v_all_cycles THEN
    RETURN QUERY
    SELECT
      m.primary_id, m.display_name, 'all'::text AS cycle, m.type::text, m.types::text[],
      m.total_amount, m.total_transactions, m.recipient_count,
      m.is_consolidated, m.name_variations,
      COALESCE((SELECT c.total_count FROM private.donor_consolidated_counts_mv c
                 WHERE c.all_cycles = true AND c.cycle = 'all'), 0)::bigint AS total_count,
      m.federal_amount, m.state_amount, m.sources
    FROM private.donor_consolidated_all_mv m
    WHERE m.is_refund = false
    ORDER BY m.total_amount DESC NULLS LAST, m.display_name ASC NULLS LAST
    LIMIT v_limit OFFSET v_offset;
    RETURN;
  END IF;

  -- General path: single cycle.
  IF NOT v_all_cycles THEN
    RETURN QUERY
    SELECT
      dcmv.primary_id, dcmv.display_name, dcmv.cycle, dcmv.type::text, dcmv.types::text[],
      (CASE WHEN v_source = 'federal' THEN dcmv.federal_amount
            WHEN v_source = 'state'   THEN dcmv.state_amount
            ELSE dcmv.total_amount END) AS total_amount,
      dcmv.total_transactions, dcmv.recipient_count, dcmv.is_consolidated, dcmv.name_variations,
      (count(*) OVER ())::bigint AS total_count,
      dcmv.federal_amount, dcmv.state_amount, dcmv.sources
    FROM private.donor_consolidated_mv dcmv
    WHERE dcmv.cycle = p_cycle
      AND dcmv.is_refund = false
      AND (
        v_all_types
        OR (v_org_pac AND ('PAC' = ANY(dcmv.types::text[]) OR 'Organization' = ANY(dcmv.types::text[])))
        OR p_type = ANY(dcmv.types::text[])
      )
      AND (v_all_sources OR v_source = ANY(dcmv.sources))
      AND (v_search IS NULL OR dcmv.search_text ILIKE '%' || v_search || '%')
      AND (p_min_amount IS NULL OR
           (CASE WHEN v_source = 'federal' THEN dcmv.federal_amount
                 WHEN v_source = 'state'   THEN dcmv.state_amount
                 ELSE dcmv.total_amount END) >= p_min_amount)
    ORDER BY
      CASE WHEN v_sort_by = 'name' AND v_sort_order = 'desc' THEN dcmv.display_name END DESC NULLS LAST,
      CASE WHEN v_sort_by = 'name' AND v_sort_order <> 'desc' THEN dcmv.display_name END ASC NULLS LAST,
      CASE WHEN v_sort_by <> 'name' AND v_sort_order = 'asc' THEN
        (CASE WHEN v_source = 'federal' THEN dcmv.federal_amount
              WHEN v_source = 'state'   THEN dcmv.state_amount
              ELSE dcmv.total_amount END) END ASC NULLS LAST,
      CASE WHEN v_sort_by <> 'name' AND v_sort_order <> 'asc' THEN
        (CASE WHEN v_source = 'federal' THEN dcmv.federal_amount
              WHEN v_source = 'state'   THEN dcmv.state_amount
              ELSE dcmv.total_amount END) END DESC NULLS LAST,
      dcmv.display_name ASC NULLS LAST
    LIMIT v_limit OFFSET v_offset;
    RETURN;
  END IF;

  -- General path: all cycles.
  RETURN QUERY
  SELECT
    m.primary_id, m.display_name, 'all'::text AS cycle, m.type::text, m.types::text[],
    (CASE WHEN v_source = 'federal' THEN m.federal_amount
          WHEN v_source = 'state'   THEN m.state_amount
          ELSE m.total_amount END) AS total_amount,
    m.total_transactions, m.recipient_count, m.is_consolidated, m.name_variations,
    (count(*) OVER ())::bigint AS total_count,
    m.federal_amount, m.state_amount, m.sources
  FROM private.donor_consolidated_all_mv m
  WHERE m.is_refund = false
    AND (
      v_all_types
      OR (v_org_pac AND ('PAC' = ANY(m.types::text[]) OR 'Organization' = ANY(m.types::text[])))
      OR p_type = ANY(m.types::text[])
    )
    AND (v_all_sources OR v_source = ANY(m.sources))
    AND (v_search IS NULL OR m.search_text ILIKE '%' || v_search || '%')
    AND (p_min_amount IS NULL OR
         (CASE WHEN v_source = 'federal' THEN m.federal_amount
               WHEN v_source = 'state'   THEN m.state_amount
               ELSE m.total_amount END) >= p_min_amount)
  ORDER BY
    CASE WHEN v_sort_by = 'name' AND v_sort_order = 'desc' THEN m.display_name END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'name' AND v_sort_order <> 'desc' THEN m.display_name END ASC NULLS LAST,
    CASE WHEN v_sort_by <> 'name' AND v_sort_order = 'asc' THEN
      (CASE WHEN v_source = 'federal' THEN m.federal_amount
            WHEN v_source = 'state'   THEN m.state_amount
            ELSE m.total_amount END) END ASC NULLS LAST,
    CASE WHEN v_sort_by <> 'name' AND v_sort_order <> 'asc' THEN
      (CASE WHEN v_source = 'federal' THEN m.federal_amount
            WHEN v_source = 'state'   THEN m.state_amount
            ELSE m.total_amount END) END DESC NULLS LAST,
    m.display_name ASC NULLS LAST
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_donors_paginated(integer, integer, text, text, text, text, text, bigint, text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Search helpers: read the unified (federal + state) source so search covers NJ.
-- Signatures and return shapes are unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_donors_by_name(
  p_search text,
  p_type   text DEFAULT NULL,
  p_limit  integer DEFAULT 50
)
RETURNS TABLE(display_name text, type text, total_amount bigint, name_variations text[], is_consolidated boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
  WITH matches AS (
    SELECT u.display_name AS dn, u.type::text AS t, u.amount, u.name
    FROM private.donor_unified u
    WHERE (u.display_name ILIKE '%' || p_search || '%' OR u.name ILIKE '%' || p_search || '%')
      AND (p_type IS NULL OR p_type = 'all' OR u.type::text = p_type)
    LIMIT 5000
  )
  SELECT
    COALESCE(m.dn, m.name)        AS display_name,
    m.t                           AS type,
    sum(m.amount)::bigint         AS total_amount,
    array_agg(DISTINCT m.name)    AS name_variations,
    (count(DISTINCT m.name) > 1)  AS is_consolidated
  FROM matches m
  GROUP BY 1, 2
  ORDER BY total_amount DESC
  LIMIT p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.search_raw_donors_by_name(
  p_search text,
  p_type   text DEFAULT NULL,
  p_limit  integer DEFAULT 100
)
RETURNS TABLE(donor_name text, type text, total_amount bigint, transaction_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
  SELECT
    u.name AS donor_name,
    u.type::text AS type,
    sum(u.amount)::bigint AS total_amount,
    sum(u.transaction_count)::bigint AS transaction_count
  FROM private.donor_unified u
  WHERE u.name ILIKE '%' || p_search || '%'
    AND (p_type IS NULL OR p_type = 'all' OR u.type::text = p_type)
  GROUP BY u.name, u.type
  ORDER BY sum(u.amount) DESC NULLS LAST
  LIMIT GREATEST(LEAST(p_limit, 500), 1);
$function$;

GRANT EXECUTE ON FUNCTION public.search_donors_by_name(text, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_raw_donors_by_name(text, text, integer) TO anon, authenticated;
