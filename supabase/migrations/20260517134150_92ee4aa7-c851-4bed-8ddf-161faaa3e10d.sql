-- Make donor consolidation case-insensitive so "Musk, Elon" and "MUSK, ELON" merge into one card

DROP MATERIALIZED VIEW IF EXISTS private.donor_consolidated_all_mv;
DROP MATERIALIZED VIEW IF EXISTS private.donor_consolidated_mv;

-- Per-cycle: group by lower(display_name); pick canonical label as the casing tied to the largest amount
CREATE MATERIALIZED VIEW private.donor_consolidated_mv AS
SELECT
  md5(coalesce(cycle,'') || '|' || lower(coalesce(display_name, name))) AS row_id,
  cycle,
  (array_agg(coalesce(display_name, name) ORDER BY amount DESC NULLS LAST))[1] AS display_name,
  min(id) AS primary_id,
  array_agg(DISTINCT type ORDER BY d.type) AS types,
  (array_agg(type ORDER BY amount DESC NULLS LAST))[1] AS type,
  array_agg(DISTINCT name ORDER BY name) AS name_variations,
  sum(amount) AS total_amount,
  sum(COALESCE(transaction_count, 1)) AS total_transactions,
  count(DISTINCT candidate_id) AS recipient_count,
  ((count(DISTINCT name) > 1)
    OR ((array_agg(coalesce(display_name, name) ORDER BY amount DESC NULLS LAST))[1] <> min(name))
    OR (count(DISTINCT lower(coalesce(display_name, name))) < count(DISTINCT coalesce(display_name, name)))
  ) AS is_consolidated,
  ((array_agg(coalesce(display_name, name) ORDER BY amount DESC NULLS LAST))[1]
    || ' ' || string_agg(DISTINCT name, ' ' ORDER BY name)) AS search_text
FROM public.donors d
GROUP BY cycle, lower(coalesce(display_name, name));

CREATE UNIQUE INDEX donor_consolidated_mv_row_id_idx ON private.donor_consolidated_mv (row_id);
CREATE INDEX donor_consolidated_mv_cycle_idx ON private.donor_consolidated_mv (cycle);
CREATE INDEX donor_consolidated_mv_display_name_idx ON private.donor_consolidated_mv (display_name);
CREATE INDEX donor_consolidated_mv_total_amount_idx ON private.donor_consolidated_mv (total_amount DESC);

-- Across-cycles: aggregate the per-cycle mv by lower(display_name) too (defense in depth)
CREATE MATERIALIZED VIEW private.donor_consolidated_all_mv AS
WITH base AS (
  SELECT
    lower(display_name) AS lname,
    display_name,
    primary_id,
    type,
    types,
    name_variations,
    total_amount,
    total_transactions,
    recipient_count,
    is_consolidated,
    search_text
  FROM private.donor_consolidated_mv
),
sums AS (
  SELECT
    lname,
    (array_agg(display_name ORDER BY total_amount DESC NULLS LAST))[1] AS display_name,
    sum(total_amount)::bigint AS total_amount,
    sum(total_transactions)::bigint AS total_transactions,
    sum(recipient_count)::bigint AS recipient_count,
    (bool_or(is_consolidated) OR count(*) > 1) AS is_consolidated,
    string_agg(DISTINCT search_text, ' ') AS search_text
  FROM base
  GROUP BY lname
),
primary_ids AS (
  SELECT DISTINCT ON (lname) lname, primary_id, type
  FROM base
  ORDER BY lname, total_amount DESC NULLS LAST
),
names AS (
  SELECT b.lname, array_remove(array_agg(DISTINCT nv.nv), NULL) AS name_variations
  FROM base b LEFT JOIN LATERAL unnest(b.name_variations) nv(nv) ON true
  GROUP BY b.lname
),
types_agg AS (
  SELECT b.lname, array_remove(array_agg(DISTINCT t.t), NULL) AS types_text
  FROM base b LEFT JOIN LATERAL unnest(b.types::text[]) t(t) ON true
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
  s.search_text
FROM sums s
JOIN primary_ids p USING (lname)
JOIN names n USING (lname)
JOIN types_agg ta USING (lname);

CREATE UNIQUE INDEX donor_consolidated_all_mv_primary_id_idx ON private.donor_consolidated_all_mv (primary_id);
CREATE INDEX donor_consolidated_all_mv_display_name_idx ON private.donor_consolidated_all_mv (display_name);
CREATE INDEX donor_consolidated_all_mv_total_amount_idx ON private.donor_consolidated_all_mv (total_amount DESC);