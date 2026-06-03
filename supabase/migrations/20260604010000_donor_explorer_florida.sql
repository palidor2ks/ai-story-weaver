-- Add Florida (FL Division of Elections) to the donor explorer, and make the
-- consolidation per-state aware.
--
-- 1. donor_unified gains a third UNION arm for public.fl_contributions, tagged
--    source='state', state_code='FL'. FL display names resolve through the same
--    alias engine, so cross-source/cross-state linking works identically to NJ.
-- 2. The consolidation MVs carry two new columns so the UI can distinguish states:
--      - state_codes  text[]  : which states a donor gave in ({NJ}, {FL}, {NJ,FL})
--      - state_amounts jsonb  : per-state totals, e.g. {"NJ": 123, "FL": 456}
--    (federal_amount / state_amount [all states combined] / sources[] are kept.)
-- 3. get_donors_paginated's p_source accepts per-state values ('nj','fl') in
--    addition to 'federal' | 'state' | 'all', and returns state_codes/state_amounts.
--
-- FL specifics: fl_contributions exposes only is_individual for entity typing (no
-- contributor_type), and amount is numeric dollars (rounded to whole dollars to match
-- the federal/NJ convention). Recipient key is the FL candidate.

-- ---------------------------------------------------------------------------
-- 1. Unified source: federal + NJ + FL
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW private.donor_unified AS
  -- Federal (FEC)
  SELECT
    d.id AS id, d.name AS name, d.type AS type, d.amount::bigint AS amount,
    COALESCE(d.transaction_count, 1) AS transaction_count, d.cycle AS cycle,
    d.candidate_id AS recipient_key, d.contributor_state AS contributor_state,
    COALESCE(d.display_name, d.name) AS display_name, 'federal'::text AS source, NULL::text AS state_code
  FROM public.donors d

  UNION ALL

  -- State (NJ ELEC)
  SELECT
    'njc:' || x.contrib_s, x.contributor, x.type, round(x.cont_amt)::bigint, 1,
    x.election_year::text, 'nj:' || x.entity_s, x.state,
    public.resolve_donor_display_name(x.contributor, x.type::text), 'state'::text, 'NJ'::text
  FROM (
    SELECT c.contrib_s, c.contributor, c.cont_amt, c.election_year, c.entity_s, c.state,
      CASE
        WHEN c.is_individual THEN 'Individual'::public.donor_type
        WHEN c.contributor_type ILIKE '%PAC%' OR c.contributor_type ILIKE '%CMTE%'
          OR c.contributor_type ILIKE '%COMMITTEE%' OR c.contributor_type ILIKE '%PARTY%'
          OR c.contributor_type ILIKE '%POLITICAL%' THEN 'PAC'::public.donor_type
        WHEN c.contributor_type IS NULL OR c.contributor_type IN ('NOT PROVIDED', 'MISC/ OTHER', 'INTEREST')
          THEN 'Unknown'::public.donor_type
        ELSE 'Organization'::public.donor_type
      END AS type
    FROM public.nj_elec_contributions c
    WHERE c.contributor IS NOT NULL AND btrim(c.contributor) <> ''
  ) x

  UNION ALL

  -- State (FL Division of Elections)
  SELECT
    'flc:' || y.id, y.contributor, y.type, round(y.amount)::bigint, 1,
    y.election_year::text, 'fl:' || y.recipient, NULL::text,
    public.resolve_donor_display_name(y.contributor, y.type::text), 'state'::text, 'FL'::text
  FROM (
    SELECT c.id, c.contributor, c.amount, c.election_year,
      COALESCE(c.candidate_name, c.office_code || ':' || c.district::text) AS recipient,
      CASE
        WHEN c.is_individual THEN 'Individual'::public.donor_type
        WHEN c.is_individual = false THEN 'Organization'::public.donor_type
        ELSE 'Unknown'::public.donor_type
      END AS type
    FROM public.fl_contributions c
    WHERE c.contributor IS NOT NULL AND btrim(c.contributor) <> ''
  ) y;

COMMENT ON VIEW private.donor_unified IS
  'Federal (public.donors) + state (public.nj_elec_contributions, public.fl_contributions) '
  'donors in one shape, tagged with source/state_code. Feeds private.donor_consolidated_mv.';

-- ---------------------------------------------------------------------------
-- 2. Rebuild the consolidation MVs (add state_codes[] + state_amounts jsonb)
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS private.donor_consolidated_counts_mv;
DROP MATERIALIZED VIEW IF EXISTS private.donor_consolidated_all_mv;
DROP MATERIALIZED VIEW IF EXISTS private.donor_consolidated_mv;

CREATE MATERIALIZED VIEW private.donor_consolidated_mv AS
WITH grouped AS (
  SELECT
    md5((COALESCE(u.cycle, ''::text) || '|'::text) || lower(u.display_name)) AS row_id,
    u.cycle,
    (array_agg(u.display_name ORDER BY u.amount DESC NULLS LAST))[1] AS display_name,
    min(u.id) AS primary_id,
    array_agg(DISTINCT u.type ORDER BY u.type) AS types,
    (array_agg(u.type ORDER BY u.amount DESC NULLS LAST))[1] AS type,
    array_agg(DISTINCT u.name ORDER BY u.name) AS name_variations,
    sum(u.amount)::bigint AS total_amount,
    sum(u.transaction_count)::bigint AS total_transactions,
    count(DISTINCT u.recipient_key) AS recipient_count,
    count(DISTINCT u.name) > 1
      OR (array_agg(u.display_name ORDER BY u.amount DESC NULLS LAST))[1] <> min(u.name)
      OR count(DISTINCT lower(u.display_name)) < count(DISTINCT u.display_name) AS is_consolidated,
    ((array_agg(u.display_name ORDER BY u.amount DESC NULLS LAST))[1] || ' '::text)
      || string_agg(DISTINCT u.name, ' '::text ORDER BY u.name) AS search_text,
    array_agg(DISTINCT u.source ORDER BY u.source) AS sources,
    COALESCE(sum(u.amount) FILTER (WHERE u.source = 'federal'), 0)::bigint AS federal_amount,
    COALESCE(sum(u.amount) FILTER (WHERE u.source = 'state'), 0)::bigint AS state_amount,
    array_remove(array_agg(DISTINCT u.state_code), NULL) AS state_codes,
    jsonb_strip_nulls(jsonb_build_object(
      'NJ', NULLIF(COALESCE(sum(u.amount) FILTER (WHERE u.state_code = 'NJ'), 0), 0),
      'FL', NULLIF(COALESCE(sum(u.amount) FILTER (WHERE u.state_code = 'FL'), 0), 0)
    )) AS state_amounts
  FROM private.donor_unified u
  GROUP BY u.cycle, lower(u.display_name)
)
SELECT
  g.row_id, g.cycle, g.display_name, g.primary_id, g.types, g.type, g.name_variations,
  g.total_amount, g.total_transactions, g.recipient_count, g.is_consolidated, g.search_text,
  g.sources, g.federal_amount, g.state_amount, g.state_codes, g.state_amounts,
  (EXISTS (
    SELECT 1 FROM public.vendor_refund_organizations v
    WHERE v.is_active = true
      AND upper(g.display_name) LIKE (('%'::text || upper(v.name)) || '%'::text)
  )) AS is_refund
FROM grouped g;

CREATE UNIQUE INDEX donor_consolidated_mv_row_id_idx ON private.donor_consolidated_mv USING btree (row_id);
CREATE INDEX donor_consolidated_mv_cycle_amount_active_idx ON private.donor_consolidated_mv USING btree (cycle, total_amount DESC NULLS LAST, display_name) WHERE (is_refund = false);
CREATE INDEX donor_consolidated_mv_cycle_idx ON private.donor_consolidated_mv USING btree (cycle);
CREATE INDEX donor_consolidated_mv_display_name_idx ON private.donor_consolidated_mv USING btree (display_name);
CREATE INDEX donor_consolidated_mv_total_amount_idx ON private.donor_consolidated_mv USING btree (total_amount DESC);

CREATE MATERIALIZED VIEW private.donor_consolidated_all_mv AS
WITH base AS (
  SELECT lower(dcmv.display_name) AS lname, dcmv.display_name, dcmv.primary_id, dcmv.type, dcmv.types,
    dcmv.name_variations, dcmv.total_amount, dcmv.total_transactions, dcmv.recipient_count,
    dcmv.is_consolidated, dcmv.search_text, dcmv.is_refund, dcmv.sources, dcmv.federal_amount,
    dcmv.state_amount, dcmv.state_codes, dcmv.state_amounts
  FROM private.donor_consolidated_mv dcmv
), sums AS (
  SELECT base.lname,
    (array_agg(base.display_name ORDER BY base.total_amount DESC NULLS LAST))[1] AS display_name,
    sum(base.total_amount)::bigint AS total_amount,
    sum(base.total_transactions)::bigint AS total_transactions,
    sum(base.recipient_count)::bigint AS recipient_count,
    bool_or(base.is_consolidated) OR count(*) > 1 AS is_consolidated,
    string_agg(DISTINCT base.search_text, ' '::text) AS search_text,
    bool_or(base.is_refund) AS is_refund,
    sum(base.federal_amount)::bigint AS federal_amount,
    sum(base.state_amount)::bigint AS state_amount,
    jsonb_strip_nulls(jsonb_build_object(
      'NJ', NULLIF(sum(COALESCE((base.state_amounts->>'NJ')::bigint, 0)), 0),
      'FL', NULLIF(sum(COALESCE((base.state_amounts->>'FL')::bigint, 0)), 0)
    )) AS state_amounts
  FROM base GROUP BY base.lname
), primary_ids AS (
  SELECT DISTINCT ON (base.lname) base.lname, base.primary_id, base.type
  FROM base ORDER BY base.lname, base.total_amount DESC NULLS LAST
), names AS (
  SELECT b.lname, array_remove(array_agg(DISTINCT nv.nv), NULL::text) AS name_variations
  FROM base b LEFT JOIN LATERAL unnest(b.name_variations) nv(nv) ON true GROUP BY b.lname
), types_agg AS (
  SELECT b.lname, array_remove(array_agg(DISTINCT t.t), NULL::text) AS types_text
  FROM base b LEFT JOIN LATERAL unnest(b.types::text[]) t(t) ON true GROUP BY b.lname
), sources_agg AS (
  SELECT b.lname, array_remove(array_agg(DISTINCT s.s), NULL::text) AS sources
  FROM base b LEFT JOIN LATERAL unnest(b.sources) s(s) ON true GROUP BY b.lname
), state_codes_agg AS (
  SELECT b.lname, array_remove(array_agg(DISTINCT sc.sc), NULL::text) AS state_codes
  FROM base b LEFT JOIN LATERAL unnest(b.state_codes) sc(sc) ON true GROUP BY b.lname
)
SELECT
  p.primary_id, s.display_name, p.type, ta.types_text::donor_type[] AS types,
  s.total_amount, s.total_transactions, s.recipient_count, s.is_consolidated, n.name_variations,
  s.search_text, s.is_refund, sa.sources, s.federal_amount, s.state_amount,
  sca.state_codes, s.state_amounts
FROM sums s
  JOIN primary_ids p USING (lname)
  JOIN names n USING (lname)
  JOIN types_agg ta USING (lname)
  JOIN sources_agg sa USING (lname)
  JOIN state_codes_agg sca USING (lname);

CREATE UNIQUE INDEX donor_consolidated_all_mv_primary_id_idx ON private.donor_consolidated_all_mv USING btree (primary_id);
CREATE INDEX donor_consolidated_all_mv_amount_active_idx ON private.donor_consolidated_all_mv USING btree (total_amount DESC NULLS LAST, display_name) WHERE (is_refund = false);
CREATE INDEX donor_consolidated_all_mv_display_name_idx ON private.donor_consolidated_all_mv USING btree (display_name);
CREATE INDEX donor_consolidated_all_mv_total_amount_idx ON private.donor_consolidated_all_mv USING btree (total_amount DESC);

CREATE MATERIALIZED VIEW private.donor_consolidated_counts_mv AS
  SELECT true AS all_cycles, 'all'::text AS cycle, count(*) AS total_count
    FROM private.donor_consolidated_all_mv WHERE donor_consolidated_all_mv.is_refund = false
  UNION ALL
  SELECT false AS all_cycles, dcmv.cycle, count(*) AS total_count
    FROM private.donor_consolidated_mv dcmv WHERE dcmv.is_refund = false GROUP BY dcmv.cycle;

CREATE UNIQUE INDEX donor_consolidated_counts_mv_key_idx ON private.donor_consolidated_counts_mv USING btree (all_cycles, cycle);

-- ---------------------------------------------------------------------------
-- 3. Per-state-aware get_donors_paginated
--    p_source: NULL/'all' | 'federal' | 'state' (all states) | 'nj' | 'fl'
--    New output columns: state_codes (text[]), state_amounts (jsonb).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_donors_paginated(integer, integer, text, text, text, text, text, bigint, text);

CREATE OR REPLACE FUNCTION public.get_donors_paginated(
  p_page integer DEFAULT 1, p_page_size integer DEFAULT 50, p_sort_by text DEFAULT 'amount'::text,
  p_sort_order text DEFAULT 'desc'::text, p_cycle text DEFAULT NULL::text, p_type text DEFAULT NULL::text,
  p_search text DEFAULT NULL::text, p_min_amount bigint DEFAULT NULL::bigint, p_source text DEFAULT NULL::text
)
RETURNS TABLE(
  primary_id text, display_name text, cycle text, type text, types text[], total_amount bigint,
  total_transactions bigint, recipient_count bigint, is_consolidated boolean, name_variations text[],
  total_count bigint, federal_amount bigint, state_amount bigint, sources text[],
  state_codes text[], state_amounts jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'private'
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
  v_norm text := lower(coalesce(p_source, ''));
  v_source text := CASE
                     WHEN v_norm IN ('', 'all') THEN NULL
                     WHEN v_norm LIKE 'fed%' THEN 'federal'
                     WHEN v_norm IN ('nj', 'fl', 'state') THEN 'state'
                     ELSE NULL
                   END;
  v_state_code text := CASE WHEN v_norm = 'nj' THEN 'NJ' WHEN v_norm = 'fl' THEN 'FL' ELSE NULL END;
  v_all_sources boolean := (v_source IS NULL);
  v_default_fast_path boolean := false;
BEGIN
  v_default_fast_path := v_sort_by <> 'name' AND v_sort_order <> 'asc' AND v_all_types
    AND v_all_sources AND v_search IS NULL AND p_min_amount IS NULL;

  IF v_default_fast_path AND NOT v_all_cycles THEN
    RETURN QUERY
    SELECT dcmv.primary_id, dcmv.display_name, dcmv.cycle, dcmv.type::text, dcmv.types::text[],
      dcmv.total_amount, dcmv.total_transactions, dcmv.recipient_count, dcmv.is_consolidated, dcmv.name_variations,
      COALESCE((SELECT c.total_count FROM private.donor_consolidated_counts_mv c
                WHERE c.all_cycles = false AND c.cycle = p_cycle), 0)::bigint,
      dcmv.federal_amount, dcmv.state_amount, dcmv.sources, dcmv.state_codes, dcmv.state_amounts
    FROM private.donor_consolidated_mv dcmv
    WHERE dcmv.cycle = p_cycle AND dcmv.is_refund = false
    ORDER BY dcmv.total_amount DESC NULLS LAST, dcmv.display_name ASC NULLS LAST
    LIMIT v_limit OFFSET v_offset;
    RETURN;
  END IF;

  IF v_default_fast_path AND v_all_cycles THEN
    RETURN QUERY
    SELECT m.primary_id, m.display_name, 'all'::text, m.type::text, m.types::text[],
      m.total_amount, m.total_transactions, m.recipient_count, m.is_consolidated, m.name_variations,
      COALESCE((SELECT c.total_count FROM private.donor_consolidated_counts_mv c
                WHERE c.all_cycles = true AND c.cycle = 'all'), 0)::bigint,
      m.federal_amount, m.state_amount, m.sources, m.state_codes, m.state_amounts
    FROM private.donor_consolidated_all_mv m
    WHERE m.is_refund = false
    ORDER BY m.total_amount DESC NULLS LAST, m.display_name ASC NULLS LAST
    LIMIT v_limit OFFSET v_offset;
    RETURN;
  END IF;

  IF NOT v_all_cycles THEN
    RETURN QUERY
    SELECT dcmv.primary_id, dcmv.display_name, dcmv.cycle, dcmv.type::text, dcmv.types::text[],
      (CASE WHEN v_source = 'federal' THEN dcmv.federal_amount
            WHEN v_source = 'state' AND v_state_code IS NOT NULL THEN COALESCE((dcmv.state_amounts->>v_state_code)::bigint, 0)
            WHEN v_source = 'state' THEN dcmv.state_amount
            ELSE dcmv.total_amount END),
      dcmv.total_transactions, dcmv.recipient_count, dcmv.is_consolidated, dcmv.name_variations,
      (count(*) OVER ())::bigint,
      dcmv.federal_amount, dcmv.state_amount, dcmv.sources, dcmv.state_codes, dcmv.state_amounts
    FROM private.donor_consolidated_mv dcmv
    WHERE dcmv.cycle = p_cycle AND dcmv.is_refund = false
      AND (v_all_types OR (v_org_pac AND ('PAC' = ANY(dcmv.types::text[]) OR 'Organization' = ANY(dcmv.types::text[]))) OR p_type = ANY(dcmv.types::text[]))
      AND (v_all_sources
           OR (v_source = 'federal' AND 'federal' = ANY(dcmv.sources))
           OR (v_source = 'state' AND v_state_code IS NOT NULL AND v_state_code = ANY(dcmv.state_codes))
           OR (v_source = 'state' AND v_state_code IS NULL AND 'state' = ANY(dcmv.sources)))
      AND (v_search IS NULL OR dcmv.search_text ILIKE '%' || v_search || '%')
      AND (p_min_amount IS NULL OR
           (CASE WHEN v_source = 'federal' THEN dcmv.federal_amount
                 WHEN v_source = 'state' AND v_state_code IS NOT NULL THEN COALESCE((dcmv.state_amounts->>v_state_code)::bigint, 0)
                 WHEN v_source = 'state' THEN dcmv.state_amount
                 ELSE dcmv.total_amount END) >= p_min_amount)
    ORDER BY
      CASE WHEN v_sort_by = 'name' AND v_sort_order = 'desc' THEN dcmv.display_name END DESC NULLS LAST,
      CASE WHEN v_sort_by = 'name' AND v_sort_order <> 'desc' THEN dcmv.display_name END ASC NULLS LAST,
      CASE WHEN v_sort_by <> 'name' AND v_sort_order = 'asc' THEN
        (CASE WHEN v_source = 'federal' THEN dcmv.federal_amount
              WHEN v_source = 'state' AND v_state_code IS NOT NULL THEN COALESCE((dcmv.state_amounts->>v_state_code)::bigint, 0)
              WHEN v_source = 'state' THEN dcmv.state_amount
              ELSE dcmv.total_amount END) END ASC NULLS LAST,
      CASE WHEN v_sort_by <> 'name' AND v_sort_order <> 'asc' THEN
        (CASE WHEN v_source = 'federal' THEN dcmv.federal_amount
              WHEN v_source = 'state' AND v_state_code IS NOT NULL THEN COALESCE((dcmv.state_amounts->>v_state_code)::bigint, 0)
              WHEN v_source = 'state' THEN dcmv.state_amount
              ELSE dcmv.total_amount END) END DESC NULLS LAST,
      dcmv.display_name ASC NULLS LAST
    LIMIT v_limit OFFSET v_offset;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT m.primary_id, m.display_name, 'all'::text, m.type::text, m.types::text[],
    (CASE WHEN v_source = 'federal' THEN m.federal_amount
          WHEN v_source = 'state' AND v_state_code IS NOT NULL THEN COALESCE((m.state_amounts->>v_state_code)::bigint, 0)
          WHEN v_source = 'state' THEN m.state_amount
          ELSE m.total_amount END),
    m.total_transactions, m.recipient_count, m.is_consolidated, m.name_variations,
    (count(*) OVER ())::bigint,
    m.federal_amount, m.state_amount, m.sources, m.state_codes, m.state_amounts
  FROM private.donor_consolidated_all_mv m
  WHERE m.is_refund = false
    AND (v_all_types OR (v_org_pac AND ('PAC' = ANY(m.types::text[]) OR 'Organization' = ANY(m.types::text[]))) OR p_type = ANY(m.types::text[]))
    AND (v_all_sources
         OR (v_source = 'federal' AND 'federal' = ANY(m.sources))
         OR (v_source = 'state' AND v_state_code IS NOT NULL AND v_state_code = ANY(m.state_codes))
         OR (v_source = 'state' AND v_state_code IS NULL AND 'state' = ANY(m.sources)))
    AND (v_search IS NULL OR m.search_text ILIKE '%' || v_search || '%')
    AND (p_min_amount IS NULL OR
         (CASE WHEN v_source = 'federal' THEN m.federal_amount
               WHEN v_source = 'state' AND v_state_code IS NOT NULL THEN COALESCE((m.state_amounts->>v_state_code)::bigint, 0)
               WHEN v_source = 'state' THEN m.state_amount
               ELSE m.total_amount END) >= p_min_amount)
  ORDER BY
    CASE WHEN v_sort_by = 'name' AND v_sort_order = 'desc' THEN m.display_name END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'name' AND v_sort_order <> 'desc' THEN m.display_name END ASC NULLS LAST,
    CASE WHEN v_sort_by <> 'name' AND v_sort_order = 'asc' THEN
      (CASE WHEN v_source = 'federal' THEN m.federal_amount
            WHEN v_source = 'state' AND v_state_code IS NOT NULL THEN COALESCE((m.state_amounts->>v_state_code)::bigint, 0)
            WHEN v_source = 'state' THEN m.state_amount
            ELSE m.total_amount END) END ASC NULLS LAST,
    CASE WHEN v_sort_by <> 'name' AND v_sort_order <> 'asc' THEN
      (CASE WHEN v_source = 'federal' THEN m.federal_amount
            WHEN v_source = 'state' AND v_state_code IS NOT NULL THEN COALESCE((m.state_amounts->>v_state_code)::bigint, 0)
            WHEN v_source = 'state' THEN m.state_amount
            ELSE m.total_amount END) END DESC NULLS LAST,
    m.display_name ASC NULLS LAST
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_donors_paginated(integer, integer, text, text, text, text, text, bigint, text)
  TO anon, authenticated, service_role;
