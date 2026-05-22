
-- Enable trigram for fast name search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Materialized view union of all taggable committees
DROP MATERIALIZED VIEW IF EXISTS public.committee_pool_mv CASCADE;
CREATE MATERIALIZED VIEW public.committee_pool_mv AS
WITH unioned AS (
  SELECT
    fec_committee_id,
    name,
    designation,
    NULL::text AS committee_type,
    'candidate_committees'::text AS source,
    1 AS priority
  FROM public.candidate_committees
  WHERE fec_committee_id IS NOT NULL
    AND (designation IS NULL OR (designation <> 'P' AND designation <> 'A'))

  UNION ALL
  SELECT
    fec_committee_id,
    name,
    NULL::text AS designation,
    NULL::text AS committee_type,
    'independent_expenditures'::text AS source,
    2 AS priority
  FROM public.list_ie_spenders()

  UNION ALL
  SELECT
    fec_committee_id,
    name,
    designation,
    committee_type,
    'external_pacs'::text AS source,
    3 AS priority
  FROM public.external_pacs
  WHERE fec_committee_id IS NOT NULL
),
ranked AS (
  SELECT *,
    row_number() OVER (PARTITION BY fec_committee_id ORDER BY priority ASC) AS rn
  FROM unioned
)
SELECT fec_committee_id, name, designation, committee_type, source
FROM ranked
WHERE rn = 1;

CREATE UNIQUE INDEX committee_pool_mv_id_uk ON public.committee_pool_mv (fec_committee_id);
CREATE INDEX committee_pool_mv_name_trgm ON public.committee_pool_mv USING gin (lower(coalesce(name,'')) gin_trgm_ops);
CREATE INDEX committee_pool_mv_source_idx ON public.committee_pool_mv (source);

GRANT SELECT ON public.committee_pool_mv TO authenticated, anon, service_role;

-- Refresh helper (admin only)
CREATE OR REPLACE FUNCTION public.refresh_committee_pool()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.committee_pool_mv;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_committee_pool() TO authenticated, service_role;

-- Paginated lookup RPC
CREATE OR REPLACE FUNCTION public.list_committee_pool(
  p_search text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_assigned text DEFAULT NULL,  -- 'all' | 'unassigned' | 'ai' | 'admin' | 'low-confidence'
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  fec_committee_id text,
  name text,
  designation text,
  committee_type text,
  source text,
  primary_cause_id text,
  secondary_cause_ids text[],
  admin_overridden boolean,
  ai_confidence text,
  ai_reasoning text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := nullif(trim(coalesce(p_search,'')), '');
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT
      p.fec_committee_id,
      p.name,
      p.designation,
      p.committee_type,
      p.source,
      t.primary_cause_id,
      t.secondary_cause_ids,
      t.admin_overridden,
      t.ai_confidence,
      t.ai_reasoning
    FROM public.committee_pool_mv p
    LEFT JOIN public.committee_topics t USING (fec_committee_id)
    WHERE (p_source IS NULL OR p_source = 'all' OR p.source = p_source)
      AND (
        v_search IS NULL
        OR lower(coalesce(p.name,'')) LIKE '%' || lower(v_search) || '%'
        OR lower(p.fec_committee_id) LIKE '%' || lower(v_search) || '%'
      )
      AND (
        p_assigned IS NULL OR p_assigned = 'all'
        OR (p_assigned = 'unassigned' AND t.fec_committee_id IS NULL)
        OR (p_assigned = 'ai' AND t.fec_committee_id IS NOT NULL AND NOT coalesce(t.admin_overridden, false))
        OR (p_assigned = 'admin' AND coalesce(t.admin_overridden, false))
        OR (p_assigned = 'low-confidence' AND t.ai_confidence = 'low')
      )
  ),
  counted AS (
    SELECT count(*) AS c FROM filtered
  )
  SELECT
    f.fec_committee_id, f.name, f.designation, f.committee_type, f.source,
    f.primary_cause_id, f.secondary_cause_ids, f.admin_overridden,
    f.ai_confidence, f.ai_reasoning,
    (SELECT c FROM counted) AS total_count
  FROM filtered f
  ORDER BY f.name NULLS LAST, f.fec_committee_id
  LIMIT greatest(1, least(coalesce(p_limit, 100), 500))
  OFFSET greatest(0, coalesce(p_offset, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_committee_pool(text, text, text, int, int) TO authenticated, service_role;

-- Initial populate
REFRESH MATERIALIZED VIEW public.committee_pool_mv;
