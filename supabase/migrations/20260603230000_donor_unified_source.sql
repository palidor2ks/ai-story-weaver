-- Unified donor source: federal (FEC) + state (NJ ELEC) in one shape.
--
-- This is the single feed the donor-consolidation materialized views read from.
-- Federal rows come from public.donors; state rows from public.nj_elec_contributions,
-- projected onto the same columns. A `source` ('federal' | 'state') and `state_code`
-- dimension keep the two distinguishable and let more states be added later by simply
-- UNION-ing another projection here.
--
-- Cross-source linking: NJ display names are resolved through the SAME alias engine
-- (public.resolve_donor_display_name), so a curated donor alias automatically merges a
-- donor across federal and state once the consolidation MVs are refreshed.
--
-- Notes / deliberate choices:
--   * NJ cont_amt (numeric dollars) is rounded to whole dollars to match the federal
--     integer-dollar convention. Sub-dollar precision is irrelevant at display scale.
--   * NJ negative amounts (refunds/adjustments) are kept and net against the donor's
--     total, mirroring how FEC adjustments already behave.
--   * NJ candidate-committee transfers are included (they map to Org/PAC), matching the
--     existing federal behavior of including committee-to-committee activity.

CREATE OR REPLACE VIEW private.donor_unified AS
  -- ----- Federal (FEC) -----------------------------------------------------
  SELECT
    d.id                              AS id,
    d.name                            AS name,
    d.type                            AS type,
    d.amount::bigint                  AS amount,
    COALESCE(d.transaction_count, 1)  AS transaction_count,
    d.cycle                           AS cycle,
    d.candidate_id                    AS recipient_key,
    d.contributor_state               AS contributor_state,
    COALESCE(d.display_name, d.name)  AS display_name,
    'federal'::text                   AS source,
    NULL::text                        AS state_code
  FROM public.donors d

  UNION ALL

  -- ----- State (NJ ELEC) ---------------------------------------------------
  SELECT
    'njc:' || x.contrib_s             AS id,
    x.contributor                     AS name,
    x.type                            AS type,
    round(x.cont_amt)::bigint         AS amount,
    1                                 AS transaction_count,
    x.election_year::text             AS cycle,
    'nj:' || x.entity_s               AS recipient_key,
    x.state                           AS contributor_state,
    public.resolve_donor_display_name(x.contributor, x.type::text) AS display_name,
    'state'::text                     AS source,
    'NJ'::text                        AS state_code
  FROM (
    SELECT
      c.contrib_s,
      c.contributor,
      c.cont_amt,
      c.election_year,
      c.entity_s,
      c.state,
      CASE
        WHEN c.is_individual THEN 'Individual'::public.donor_type
        WHEN c.contributor_type ILIKE '%PAC%'
          OR c.contributor_type ILIKE '%CMTE%'
          OR c.contributor_type ILIKE '%COMMITTEE%'
          OR c.contributor_type ILIKE '%PARTY%'
          OR c.contributor_type ILIKE '%POLITICAL%' THEN 'PAC'::public.donor_type
        WHEN c.contributor_type IS NULL
          OR c.contributor_type IN ('NOT PROVIDED', 'MISC/ OTHER', 'INTEREST')
          THEN 'Unknown'::public.donor_type
        ELSE 'Organization'::public.donor_type
      END AS type
    FROM public.nj_elec_contributions c
    WHERE c.contributor IS NOT NULL
      AND btrim(c.contributor) <> ''
  ) x;

COMMENT ON VIEW private.donor_unified IS
  'Federal (public.donors) + state (public.nj_elec_contributions) donors in one shape, '
  'tagged with source/state_code. Feeds private.donor_consolidated_mv.';
