-- Phase 3: curated donor aliases that consolidate NJ state spelling variants
-- (and link them to the federal donor of the same name where one exists).
--
-- Conservative, high-confidence STARTER set: every member of a group differs only
-- by whitespace / punctuation of the SAME entity, so there is no risk of merging
-- distinct donors. Members are data-driven (matched by normalized name against
-- nj_elec_contributions) and carry the same (name, mapped_type) the donor_unified
-- view uses -- including every type a spelling appears under -- so resolution hits.
--
-- Done as SEPARATE statements: the member insert must see the aliases inserted
-- above it, which a sibling join inside a single data-modifying CTE would NOT.
-- Idempotent: aliases inserted only when absent; members use ON CONFLICT.

-- 1. Canonical aliases.
WITH groups(canonical_name, norm_key) AS (
  VALUES
    ('GREATER NJ CARPENTERS PEC',                    'GREATER NJ CARPENTERS PEC'),
    ('NJ REPUBLICAN STATE COMMITTEE',                'NJ REPUBLICAN STATE COMMITTEE'),
    ('NJ STATE LABORERS PAC',                        'NJ STATE LABORERS PAC'),
    ('NEW JERSEY STATE LABORERS PAC',                'NEW JERSEY STATE LABORERS PAC'),
    ('LOCAL 102 PAC',                                'LOCAL 102 PAC'),
    ('NJEA PAC',                                     'NJEA PAC'),
    ('NJEA POLITICAL ACTION COMMITTEE',              'NJEA POLITICAL ACTION COMMITTEE'),
    ('CAR-PAC',                                      'CAR PAC'),
    ('IBEW LOCAL 351 STATE PAC FUND',                'IBEW LOCAL 351 STATE PAC FUND'),
    ('LOCAL UNION 400 IBEW PAC FUND',                'LOCAL UNION 400 IBEW PAC FUND'),
    ('REALTORS POLITICAL ACTION COMMITTEE',          'REALTORS POLITICAL ACTION COMMITTEE'),
    ('ELECTION FUND OF CRAIG J. COUGHLIN',           'ELECTION FUND OF CRAIG J COUGHLIN'),
    ('NEW JERSEY ASSOCIATION FOR JUSTICE',           'NEW JERSEY ASSOCIATION FOR JUSTICE'),
    ('PLUMBERS & PIPEFITTERS LOCAL UNION NO. 9 PAC', 'PLUMBERS PIPEFITTERS LOCAL UNION NO 9 PAC'),
    ('SHIPPING ASSOCIATION OF NY & NJ',              'SHIPPING ASSOCIATION OF NY NJ')
)
INSERT INTO public.donor_aliases (canonical_name, is_active, notes)
SELECT g.canonical_name, true, 'Combined federal + NJ state starter alias'
FROM groups g
WHERE NOT EXISTS (SELECT 1 FROM public.donor_aliases a WHERE a.canonical_name = g.canonical_name);

-- 2. Attach NJ name variants as members (data-driven type per spelling).
WITH groups(canonical_name, norm_key) AS (
  VALUES
    ('GREATER NJ CARPENTERS PEC',                    'GREATER NJ CARPENTERS PEC'),
    ('NJ REPUBLICAN STATE COMMITTEE',                'NJ REPUBLICAN STATE COMMITTEE'),
    ('NJ STATE LABORERS PAC',                        'NJ STATE LABORERS PAC'),
    ('NEW JERSEY STATE LABORERS PAC',                'NEW JERSEY STATE LABORERS PAC'),
    ('LOCAL 102 PAC',                                'LOCAL 102 PAC'),
    ('NJEA PAC',                                     'NJEA PAC'),
    ('NJEA POLITICAL ACTION COMMITTEE',              'NJEA POLITICAL ACTION COMMITTEE'),
    ('CAR-PAC',                                      'CAR PAC'),
    ('IBEW LOCAL 351 STATE PAC FUND',                'IBEW LOCAL 351 STATE PAC FUND'),
    ('LOCAL UNION 400 IBEW PAC FUND',                'LOCAL UNION 400 IBEW PAC FUND'),
    ('REALTORS POLITICAL ACTION COMMITTEE',          'REALTORS POLITICAL ACTION COMMITTEE'),
    ('ELECTION FUND OF CRAIG J. COUGHLIN',           'ELECTION FUND OF CRAIG J COUGHLIN'),
    ('NEW JERSEY ASSOCIATION FOR JUSTICE',           'NEW JERSEY ASSOCIATION FOR JUSTICE'),
    ('PLUMBERS & PIPEFITTERS LOCAL UNION NO. 9 PAC', 'PLUMBERS PIPEFITTERS LOCAL UNION NO 9 PAC'),
    ('SHIPPING ASSOCIATION OF NY & NJ',              'SHIPPING ASSOCIATION OF NY NJ')
)
INSERT INTO public.donor_alias_members (alias_id, donor_name, donor_type)
SELECT a.id, m.donor_name, m.donor_type
FROM groups g
JOIN public.donor_aliases a ON a.canonical_name = g.canonical_name
CROSS JOIN LATERAL (
  SELECT DISTINCT
    c.contributor AS donor_name,
    (CASE
       WHEN c.is_individual THEN 'Individual'
       WHEN c.contributor_type ILIKE '%PAC%' OR c.contributor_type ILIKE '%CMTE%'
         OR c.contributor_type ILIKE '%COMMITTEE%' OR c.contributor_type ILIKE '%PARTY%'
         OR c.contributor_type ILIKE '%POLITICAL%' THEN 'PAC'
       WHEN c.contributor_type IS NULL OR c.contributor_type IN ('NOT PROVIDED', 'MISC/ OTHER', 'INTEREST')
         THEN 'Unknown'
       ELSE 'Organization'
     END) AS donor_type
  FROM public.nj_elec_contributions c
  WHERE c.contributor IS NOT NULL
    AND btrim(upper(regexp_replace(c.contributor, '[^A-Za-z0-9]+', ' ', 'g'))) = g.norm_key
) m
ON CONFLICT (donor_name, donor_type) DO NOTHING;

-- 3. Backfill federal donor rows that are now members so their stored
-- display_name reflects the canonical (NJ rows resolve live in donor_unified).
UPDATE public.donors d
SET display_name = a.canonical_name
FROM public.donor_alias_members m
JOIN public.donor_aliases a ON a.id = m.alias_id AND a.is_active = true
WHERE d.name = m.donor_name
  AND d.type::text = m.donor_type
  AND d.display_name IS DISTINCT FROM a.canonical_name;

-- NOTE: refresh the consolidation MVs for these aliases to take effect
-- (private.refresh_donor_consolidated_mv / public.refresh_donor_consolidated_mv).
