-- NJ state donor profile support.
--
-- The public donor explorer's list (get_donors_paginated -> donor_consolidated_mv
-- -> donor_unified) includes New Jersey ELEC contributors with synthetic ids of
-- the form `njc:<contrib_s>`. Those rows live in public.nj_elec_contributions, not
-- in the federal public.donors table, so the donor *profile* page -- which looks a
-- donor up by donors.id -- returned "Donor not found" for every NJ donor.
--
-- This adds:
--   1) an index on nj_elec_contributions(contributor) so a donor's full giving
--      history can be fetched without a sequential scan, and
--   2) get_nj_donor_profile(p_id) -- a SECURITY DEFINER RPC that resolves an
--      `njc:` id to its contributor and returns a single JSON blob with the donor's
--      identity, headline totals, top recipients, and contribution history.
--
-- Federal donor profiles are unchanged (they continue to read public.donors).

CREATE INDEX IF NOT EXISTS idx_nj_elec_contrib_contributor
  ON public.nj_elec_contributions (contributor);

CREATE OR REPLACE FUNCTION public.get_nj_donor_profile(p_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
  WITH seed_key AS (
    -- Only `njc:<digits>` ids resolve here; anything else yields found:false.
    SELECT CASE WHEN p_id ~ '^njc:[0-9]+$' THEN substr(p_id, 5)::bigint END AS cs
  ),
  seed AS (
    SELECT c.contributor
    FROM public.nj_elec_contributions c, seed_key k
    WHERE c.contrib_s = k.cs
    LIMIT 1
  ),
  rows AS (
    -- All contributions made by this contributor, with a per-row entity type that
    -- mirrors the categorisation used in private.donor_unified.
    SELECT c.*,
      CASE
        WHEN c.is_individual THEN 'Individual'
        WHEN c.contributor_type ILIKE '%PAC%' OR c.contributor_type ILIKE '%CMTE%'
          OR c.contributor_type ILIKE '%COMMITTEE%' OR c.contributor_type ILIKE '%PARTY%'
          OR c.contributor_type ILIKE '%POLITICAL%' THEN 'PAC'
        WHEN c.contributor_type IS NULL
          OR c.contributor_type IN ('NOT PROVIDED', 'MISC/ OTHER', 'INTEREST') THEN 'Unknown'
        ELSE 'Organization'
      END AS derived_type
    FROM public.nj_elec_contributions c
    JOIN seed s ON s.contributor = c.contributor
  ),
  dtype AS (
    -- Pick the donor's headline type from their largest gift, matching how the
    -- list view chooses a representative type for the consolidated group.
    SELECT derived_type FROM rows ORDER BY round(cont_amt) DESC NULLS LAST LIMIT 1
  ),
  recip AS (
    SELECT
      r.entity_s,
      COALESCE(NULLIF(e.entity_name, ''), NULLIF(r.cand_name, ''), 'Unknown') AS recipient_name,
      COALESCE(NULLIF(e.office, ''), NULLIF(r.office_code, '')) AS office,
      COALESCE(NULLIF(e.party, ''), NULLIF(r.party_code, '')) AS party,
      NULLIF(e.location, '') AS location,
      SUM(round(r.cont_amt))::bigint AS amount,
      count(*)::int AS contribution_count,
      max(r.election_year) AS last_year
    FROM rows r
    LEFT JOIN public.nj_elec_entities e ON e.entity_s = r.entity_s
    GROUP BY 1, 2, 3, 4, 5
  ),
  hist AS (
    SELECT
      r.contrib_s, r.cont_date, r.election_year, r.entity_s,
      COALESCE(NULLIF(e.entity_name, ''), NULLIF(r.cand_name, ''), 'Unknown') AS recipient_name,
      COALESCE(NULLIF(e.office, ''), NULLIF(r.office_code, '')) AS office,
      COALESCE(NULLIF(e.party, ''), NULLIF(r.party_code, '')) AS party,
      round(r.cont_amt)::bigint AS amount
    FROM rows r
    LEFT JOIN public.nj_elec_entities e ON e.entity_s = r.entity_s
    ORDER BY r.cont_date DESC NULLS LAST, r.contrib_s DESC
    LIMIT 1000
  )
  SELECT CASE
    WHEN (SELECT contributor FROM seed) IS NULL THEN jsonb_build_object('found', false)
    ELSE jsonb_build_object(
      'found', true,
      'id', p_id,
      'state_code', 'NJ',
      'source', 'state',
      'name', resolve_donor_display_name((SELECT contributor FROM seed), (SELECT derived_type FROM dtype)),
      'raw_name', (SELECT contributor FROM seed),
      'type', (SELECT derived_type FROM dtype),
      'city', (SELECT r.city FROM rows r WHERE NULLIF(r.city, '') IS NOT NULL ORDER BY r.cont_date DESC NULLS LAST LIMIT 1),
      'state', (SELECT r.state FROM rows r WHERE NULLIF(r.state, '') IS NOT NULL ORDER BY r.cont_date DESC NULLS LAST LIMIT 1),
      'employer', (SELECT r.emp_name FROM rows r WHERE NULLIF(r.emp_name, '') IS NOT NULL ORDER BY r.cont_date DESC NULLS LAST LIMIT 1),
      'occupation', (SELECT r.occupation_name FROM rows r WHERE NULLIF(r.occupation_name, '') IS NOT NULL ORDER BY r.cont_date DESC NULLS LAST LIMIT 1),
      'total_amount', COALESCE((SELECT SUM(round(r.cont_amt))::bigint FROM rows r), 0),
      'transaction_count', COALESCE((SELECT count(*)::int FROM rows r), 0),
      'recipient_count', COALESCE((SELECT count(DISTINCT r.entity_s)::int FROM rows r), 0),
      'cycles', COALESCE((SELECT jsonb_agg(DISTINCT yr ORDER BY yr DESC) FROM (SELECT r.election_year AS yr FROM rows r WHERE r.election_year IS NOT NULL) z), '[]'::jsonb),
      'recipients', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.amount DESC) FROM recip x), '[]'::jsonb),
      'contributions', COALESCE((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.cont_date DESC NULLS LAST, h.contrib_s DESC) FROM hist h), '[]'::jsonb)
    )
  END;
$func$;

GRANT EXECUTE ON FUNCTION public.get_nj_donor_profile(text) TO anon, authenticated;
