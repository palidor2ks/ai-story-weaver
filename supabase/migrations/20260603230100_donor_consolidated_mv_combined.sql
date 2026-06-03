-- Rebuild the donor-consolidation materialized views over private.donor_unified
-- (federal + state) instead of public.donors (federal only).
--
-- What changes vs. the previous definitions:
--   * Source table: private.donor_unified (federal UNION state) rather than public.donors.
--   * recipient_count now counts DISTINCT recipient_key (federal candidate_id OR
--     'nj:<entity>') so state recipients are counted too.
--   * Three new columns are carried through every level:
--       - sources         text[]  : which sources fund this donor ({federal}, {state}, {federal,state})
--       - federal_amount  bigint  : sum of federal contributions
--       - state_amount    bigint  : sum of state contributions
--   * NJ rows arrive with cycle = election_year, so get_donor_cycles() and the p_search
--     path of get_donors_paginated() pick up state data automatically.
--
-- Everything else (grouping key, display_name selection, is_consolidated, search_text,
-- is_refund vendor-refund detection) is preserved exactly, so existing behavior is
-- unchanged for federal-only donors.
--
-- DROP order (counts -> all -> mv) and CREATE order (mv -> all -> counts) follow the
-- materialized-view dependency chain. All indexes (incl. the UNIQUE indexes that
-- REFRESH ... CONCURRENTLY requires) are recreated.

DROP MATERIALIZED VIEW IF EXISTS private.donor_consolidated_counts_mv;
DROP MATERIALIZED VIEW IF EXISTS private.donor_consolidated_all_mv;
DROP MATERIALIZED VIEW IF EXISTS private.donor_consolidated_mv;

-- ---------------------------------------------------------------------------
-- Per-cycle consolidated donors
-- ---------------------------------------------------------------------------
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
    COALESCE(sum(u.amount) FILTER (WHERE u.source = 'state'), 0)::bigint AS state_amount
  FROM private.donor_unified u
  GROUP BY u.cycle, lower(u.display_name)
)
SELECT
  g.row_id,
  g.cycle,
  g.display_name,
  g.primary_id,
  g.types,
  g.type,
  g.name_variations,
  g.total_amount,
  g.total_transactions,
  g.recipient_count,
  g.is_consolidated,
  g.search_text,
  g.sources,
  g.federal_amount,
  g.state_amount,
  (EXISTS (
    SELECT 1 FROM public.vendor_refund_organizations v
    WHERE v.is_active = true
      AND upper(g.display_name) LIKE (('%'::text || upper(v.name)) || '%'::text)
  )) AS is_refund
FROM grouped g;

CREATE UNIQUE INDEX donor_consolidated_mv_row_id_idx
  ON private.donor_consolidated_mv USING btree (row_id);
CREATE INDEX donor_consolidated_mv_cycle_amount_active_idx
  ON private.donor_consolidated_mv USING btree (cycle, total_amount DESC NULLS LAST, display_name)
  WHERE (is_refund = false);
CREATE INDEX donor_consolidated_mv_cycle_idx
  ON private.donor_consolidated_mv USING btree (cycle);
CREATE INDEX donor_consolidated_mv_display_name_idx
  ON private.donor_consolidated_mv USING btree (display_name);
CREATE INDEX donor_consolidated_mv_total_amount_idx
  ON private.donor_consolidated_mv USING btree (total_amount DESC);

-- ---------------------------------------------------------------------------
-- Across-cycle ("all") consolidated donors
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW private.donor_consolidated_all_mv AS
WITH base AS (
  SELECT
    lower(dcmv.display_name) AS lname,
    dcmv.display_name, dcmv.primary_id, dcmv.type, dcmv.types, dcmv.name_variations,
    dcmv.total_amount, dcmv.total_transactions, dcmv.recipient_count, dcmv.is_consolidated,
    dcmv.search_text, dcmv.is_refund, dcmv.sources, dcmv.federal_amount, dcmv.state_amount
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
    sum(base.state_amount)::bigint AS state_amount
  FROM base GROUP BY base.lname
), primary_ids AS (
  SELECT DISTINCT ON (base.lname) base.lname, base.primary_id, base.type
  FROM base ORDER BY base.lname, base.total_amount DESC NULLS LAST
), names AS (
  SELECT b.lname, array_remove(array_agg(DISTINCT nv.nv), NULL::text) AS name_variations
  FROM base b LEFT JOIN LATERAL unnest(b.name_variations) nv(nv) ON true
  GROUP BY b.lname
), types_agg AS (
  SELECT b.lname, array_remove(array_agg(DISTINCT t.t), NULL::text) AS types_text
  FROM base b LEFT JOIN LATERAL unnest(b.types::text[]) t(t) ON true
  GROUP BY b.lname
), sources_agg AS (
  SELECT b.lname, array_remove(array_agg(DISTINCT s.s), NULL::text) AS sources
  FROM base b LEFT JOIN LATERAL unnest(b.sources) s(s) ON true
  GROUP BY b.lname
)
SELECT
  p.primary_id,
  s.display_name,
  p.type,
  ta.types_text::donor_type[] AS types,
  s.total_amount,
  s.total_transactions,
  s.recipient_count,
  s.is_consolidated,
  n.name_variations,
  s.search_text,
  s.is_refund,
  sa.sources,
  s.federal_amount,
  s.state_amount
FROM sums s
  JOIN primary_ids p USING (lname)
  JOIN names n USING (lname)
  JOIN types_agg ta USING (lname)
  JOIN sources_agg sa USING (lname);

CREATE UNIQUE INDEX donor_consolidated_all_mv_primary_id_idx
  ON private.donor_consolidated_all_mv USING btree (primary_id);
CREATE INDEX donor_consolidated_all_mv_amount_active_idx
  ON private.donor_consolidated_all_mv USING btree (total_amount DESC NULLS LAST, display_name)
  WHERE (is_refund = false);
CREATE INDEX donor_consolidated_all_mv_display_name_idx
  ON private.donor_consolidated_all_mv USING btree (display_name);
CREATE INDEX donor_consolidated_all_mv_total_amount_idx
  ON private.donor_consolidated_all_mv USING btree (total_amount DESC);

-- ---------------------------------------------------------------------------
-- Total-count cache (per cycle + all)
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW private.donor_consolidated_counts_mv AS
  SELECT true AS all_cycles, 'all'::text AS cycle, count(*) AS total_count
    FROM private.donor_consolidated_all_mv
    WHERE donor_consolidated_all_mv.is_refund = false
  UNION ALL
  SELECT false AS all_cycles, dcmv.cycle, count(*) AS total_count
    FROM private.donor_consolidated_mv dcmv
    WHERE dcmv.is_refund = false
    GROUP BY dcmv.cycle;

CREATE UNIQUE INDEX donor_consolidated_counts_mv_key_idx
  ON private.donor_consolidated_counts_mv USING btree (all_cycles, cycle);
