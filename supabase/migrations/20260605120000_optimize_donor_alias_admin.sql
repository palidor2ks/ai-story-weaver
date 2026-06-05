-- Optimize the Donor Entity Resolution admin UI.
--
-- The admin panel now asks the database for only the current aliases page, with
-- grouped member counts and lazily-derived committee IDs for those visible rows.
-- The attach-donor search also returns all row enrichment in one RPC so the UI
-- does not issue multiple follow-up queries per search.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Query-pattern indexes used by the server-side alias search and attach search.
-- These are the predicates that should be verified with EXPLAIN ANALYZE in an
-- environment with production-sized data:
--   EXPLAIN ANALYZE SELECT * FROM public.get_donor_aliases_page('seiu', 1, 50);
--   EXPLAIN ANALYZE SELECT * FROM public.search_raw_donors_admin('smith', NULL, 50);
CREATE INDEX IF NOT EXISTS idx_donor_aliases_canonical_name_trgm
  ON public.donor_aliases USING gin (canonical_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_donors_name_type_recipient_committee
  ON public.donors(name, type, recipient_committee_id);

CREATE INDEX IF NOT EXISTS idx_nj_elec_contributions_contributor_trgm
  ON public.nj_elec_contributions USING gin (contributor gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_fl_contributions_contributor_trgm
  ON public.fl_contributions USING gin (contributor gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.get_donor_alias_member_counts()
RETURNS TABLE(alias_id uuid, member_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT dam.alias_id, count(*)::bigint AS member_count
  FROM public.donor_alias_members dam
  GROUP BY dam.alias_id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_donor_alias_member_counts() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_donor_aliases_page(
  p_search text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50
)
RETURNS TABLE(
  id uuid,
  canonical_name text,
  fec_committee_id text,
  fec_committee_ids text[],
  notes text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  primary_cause_id text,
  cause_assigned_by text,
  cause_ai_confidence text,
  cause_ai_reasoning text,
  cause_assigned_at timestamptz,
  member_count bigint,
  committee_ids text[],
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH params AS (
    SELECT
      NULLIF(btrim(coalesce(p_search, '')), '') AS q,
      GREATEST(coalesce(p_page, 1), 1) AS page_num,
      LEAST(GREATEST(coalesce(p_page_size, 50), 1), 100) AS page_size
  ), filtered AS (
    SELECT da.*
    FROM public.donor_aliases da, params p
    WHERE p.q IS NULL OR da.canonical_name ILIKE '%' || p.q || '%'
  ), counted AS (
    SELECT count(*)::bigint AS total_count FROM filtered
  ), member_counts AS (
    SELECT dam.alias_id, count(*)::bigint AS member_count
    FROM public.donor_alias_members dam
    JOIN filtered f ON f.id = dam.alias_id
    GROUP BY dam.alias_id
  ), page_rows AS (
    SELECT f.*, coalesce(mc.member_count, 0)::bigint AS member_count, c.total_count
    FROM filtered f
    CROSS JOIN counted c
    LEFT JOIN member_counts mc ON mc.alias_id = f.id
    ORDER BY
      CASE WHEN coalesce(mc.member_count, 0) = 0 THEN 0 ELSE 1 END,
      f.canonical_name
    LIMIT (SELECT page_size FROM params)
    OFFSET ((SELECT page_num FROM params) - 1) * (SELECT page_size FROM params)
  ), derived_committees AS (
    SELECT
      pr.id AS alias_id,
      array_remove(array_agg(DISTINCT d.recipient_committee_id ORDER BY d.recipient_committee_id), NULL) AS derived_ids
    FROM page_rows pr
    LEFT JOIN public.donor_alias_members dam ON dam.alias_id = pr.id
    LEFT JOIN public.donors d
      ON d.name = dam.donor_name
     AND d.type = dam.donor_type::public.donor_type
     AND d.recipient_committee_id IS NOT NULL
    GROUP BY pr.id
  )
  SELECT
    pr.id,
    pr.canonical_name,
    pr.fec_committee_id,
    coalesce(pr.fec_committee_ids, '{}'::text[]) AS fec_committee_ids,
    pr.notes,
    coalesce(pr.is_active, true) AS is_active,
    pr.created_at,
    pr.updated_at,
    pr.primary_cause_id,
    pr.cause_assigned_by,
    pr.cause_ai_confidence,
    pr.cause_ai_reasoning,
    pr.cause_assigned_at,
    pr.member_count,
    CASE
      WHEN cardinality(coalesce(pr.fec_committee_ids, '{}'::text[])) > 0 THEN pr.fec_committee_ids
      WHEN pr.fec_committee_id IS NOT NULL THEN ARRAY[pr.fec_committee_id]
      ELSE coalesce(dc.derived_ids, '{}'::text[])
    END AS committee_ids,
    pr.total_count
  FROM page_rows pr
  LEFT JOIN derived_committees dc ON dc.alias_id = pr.id
  ORDER BY
    CASE WHEN pr.member_count = 0 THEN 0 ELSE 1 END,
    pr.canonical_name;
$function$;

GRANT EXECUTE ON FUNCTION public.get_donor_aliases_page(text, integer, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.search_raw_donors_admin(
  p_search text,
  p_type text DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE(
  donor_name text,
  type text,
  total_amount bigint,
  transaction_count bigint,
  alias_id uuid,
  alias_canonical_name text,
  alias_fec_committee_id text,
  alias_fec_committee_ids text[],
  alias_notes text,
  alias_is_active boolean,
  alias_created_at timestamptz,
  alias_updated_at timestamptz,
  alias_primary_cause_id text,
  alias_cause_assigned_by text,
  alias_cause_ai_confidence text,
  alias_cause_ai_reasoning text,
  alias_cause_assigned_at timestamptz,
  direct_primary_cause_id text,
  direct_assigned_by text,
  treasurer_names text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
  WITH raw AS (
    SELECT
      u.name AS donor_name,
      u.type::text AS type,
      sum(u.amount)::bigint AS total_amount,
      sum(u.transaction_count)::bigint AS transaction_count
    FROM private.donor_unified u
    WHERE NULLIF(btrim(coalesce(p_search, '')), '') IS NOT NULL
      AND u.name ILIKE '%' || btrim(p_search) || '%'
      AND (p_type IS NULL OR p_type = 'all' OR u.type::text = p_type)
    GROUP BY u.name, u.type
    ORDER BY sum(u.amount) DESC NULLS LAST
    LIMIT GREATEST(LEAST(coalesce(p_limit, 50), 100), 1)
  ), treasurers AS (
    SELECT
      r.donor_name,
      r.type,
      string_agg(DISTINCT ep.treasurer_name, ', ' ORDER BY ep.treasurer_name) AS treasurer_names
    FROM raw r
    JOIN public.donors d
      ON d.name = r.donor_name
     AND d.type = r.type::public.donor_type
     AND d.recipient_committee_id IS NOT NULL
    JOIN public.external_pacs ep
      ON ep.fec_committee_id = d.recipient_committee_id
     AND ep.treasurer_name IS NOT NULL
     AND btrim(ep.treasurer_name) <> ''
    GROUP BY r.donor_name, r.type
  )
  SELECT
    r.donor_name,
    r.type,
    r.total_amount,
    r.transaction_count,
    da.id AS alias_id,
    da.canonical_name AS alias_canonical_name,
    da.fec_committee_id AS alias_fec_committee_id,
    coalesce(da.fec_committee_ids, '{}'::text[]) AS alias_fec_committee_ids,
    da.notes AS alias_notes,
    coalesce(da.is_active, true) AS alias_is_active,
    da.created_at AS alias_created_at,
    da.updated_at AS alias_updated_at,
    da.primary_cause_id AS alias_primary_cause_id,
    da.cause_assigned_by AS alias_cause_assigned_by,
    da.cause_ai_confidence AS alias_cause_ai_confidence,
    da.cause_ai_reasoning AS alias_cause_ai_reasoning,
    da.cause_assigned_at AS alias_cause_assigned_at,
    ovr.primary_cause_id AS direct_primary_cause_id,
    ovr.assigned_by AS direct_assigned_by,
    t.treasurer_names
  FROM raw r
  LEFT JOIN public.donor_alias_members dam
    ON dam.donor_name = r.donor_name
   AND dam.donor_type = r.type
  LEFT JOIN public.donor_aliases da ON da.id = dam.alias_id
  LEFT JOIN public.donor_cause_overrides ovr
    ON ovr.donor_name = r.donor_name
   AND ovr.donor_type = r.type
  LEFT JOIN treasurers t
    ON t.donor_name = r.donor_name
   AND t.type = r.type
  ORDER BY r.total_amount DESC NULLS LAST;
$function$;

GRANT EXECUTE ON FUNCTION public.search_raw_donors_admin(text, text, integer) TO anon, authenticated;
