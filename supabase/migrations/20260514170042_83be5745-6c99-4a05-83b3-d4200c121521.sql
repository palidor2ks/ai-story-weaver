DROP MATERIALIZED VIEW IF EXISTS private.donor_consolidated_all_mv;

CREATE MATERIALIZED VIEW private.donor_consolidated_all_mv AS
WITH sums AS (
  SELECT
    display_name,
    sum(total_amount)::bigint        AS total_amount,
    sum(total_transactions)::bigint  AS total_transactions,
    sum(recipient_count)::bigint     AS recipient_count,
    bool_or(is_consolidated) OR count(*) > 1 AS is_consolidated,
    string_agg(DISTINCT search_text, ' ') AS search_text
  FROM private.donor_consolidated_mv
  GROUP BY display_name
),
primary_ids AS (
  SELECT DISTINCT ON (display_name)
    display_name, primary_id, type
  FROM private.donor_consolidated_mv
  ORDER BY display_name, total_amount DESC NULLS LAST
),
names AS (
  SELECT display_name, array_remove(array_agg(DISTINCT nv), NULL) AS name_variations
  FROM private.donor_consolidated_mv m
  LEFT JOIN LATERAL unnest(m.name_variations) AS nv ON true
  GROUP BY display_name
),
types_agg AS (
  SELECT display_name, array_remove(array_agg(DISTINCT t), NULL) AS types_text
  FROM private.donor_consolidated_mv m
  LEFT JOIN LATERAL unnest(m.types::text[]) AS t ON true
  GROUP BY display_name
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
JOIN primary_ids p USING (display_name)
JOIN names n       USING (display_name)
JOIN types_agg ta  USING (display_name);

CREATE UNIQUE INDEX donor_consolidated_all_mv_pk
  ON private.donor_consolidated_all_mv (display_name);
CREATE INDEX donor_consolidated_all_mv_amount_idx
  ON private.donor_consolidated_all_mv (total_amount DESC NULLS LAST);

GRANT SELECT ON private.donor_consolidated_all_mv TO anon, authenticated, service_role;