-- Expand curated donor aliases: consolidate NJ state org/PAC contributors that are
-- the SAME entity spelled differently (whitespace / punctuation only), data-driven.
--
-- Safe by construction: two NJ contributor strings are grouped only when identical
-- after collapsing non-alphanumeric runs to a single space (e.g. "CAR-PAC", "CAR PAC",
-- "CAR_PAC", "CAR, PAC"). Token boundaries are preserved, so distinct names are never
-- merged. Restricted to organizations/PACs (is_individual = false), groups totaling
-- >= $5,000, and skips any normalized group already covered by an existing alias
-- member (so curated aliases are never split). Canonical = highest-dollar spelling.
--
-- Alias insert and member insert are SEPARATE statements so the member join sees the
-- aliases inserted above it. All lookups are set-wise (single scan of the source) to
-- keep the migration fast. Idempotent (NOT EXISTS / ON CONFLICT). Takes effect on the
-- next consolidation refresh (the daily cron added in 20260604000000).

-- 1. One alias per qualifying normalized group.
WITH grp AS (
  SELECT upper(regexp_replace(c.contributor, '[^A-Za-z0-9]+', ' ', 'g')) AS norm,
         c.contributor,
         sum(c.cont_amt) AS amt
  FROM public.nj_elec_contributions c
  WHERE c.contributor IS NOT NULL AND btrim(c.contributor) <> '' AND c.is_individual = false
  GROUP BY 1, 2
),
aliased_norms AS (
  SELECT DISTINCT upper(regexp_replace(m.donor_name, '[^A-Za-z0-9]+', ' ', 'g')) AS norm
  FROM public.donor_alias_members m
),
qualifying AS (
  SELECT g.norm,
         (array_agg(g.contributor ORDER BY g.amt DESC NULLS LAST, g.contributor))[1] AS canonical
  FROM grp g
  GROUP BY g.norm
  HAVING count(*) > 1 AND sum(g.amt) >= 5000
),
fresh AS (
  SELECT q.* FROM qualifying q
  LEFT JOIN aliased_norms an ON an.norm = q.norm
  WHERE an.norm IS NULL
)
INSERT INTO public.donor_aliases (canonical_name, is_active, notes)
SELECT f.canonical, true, 'NJ state spelling-variant consolidation'
FROM fresh f
WHERE NOT EXISTS (SELECT 1 FROM public.donor_aliases a WHERE a.canonical_name = f.canonical);

-- 2. Attach every spelling in each fresh group as a member (data-driven type).
WITH grp AS (
  SELECT upper(regexp_replace(c.contributor, '[^A-Za-z0-9]+', ' ', 'g')) AS norm,
         c.contributor,
         sum(c.cont_amt) AS amt
  FROM public.nj_elec_contributions c
  WHERE c.contributor IS NOT NULL AND btrim(c.contributor) <> '' AND c.is_individual = false
  GROUP BY 1, 2
),
aliased_norms AS (
  SELECT DISTINCT upper(regexp_replace(m.donor_name, '[^A-Za-z0-9]+', ' ', 'g')) AS norm
  FROM public.donor_alias_members m
),
qualifying AS (
  SELECT g.norm,
         (array_agg(g.contributor ORDER BY g.amt DESC NULLS LAST, g.contributor))[1] AS canonical
  FROM grp g
  GROUP BY g.norm
  HAVING count(*) > 1 AND sum(g.amt) >= 5000
),
fresh AS (
  SELECT q.* FROM qualifying q
  LEFT JOIN aliased_norms an ON an.norm = q.norm
  WHERE an.norm IS NULL
),
members AS (
  SELECT DISTINCT
    upper(regexp_replace(c.contributor, '[^A-Za-z0-9]+', ' ', 'g')) AS norm,
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
  WHERE c.contributor IS NOT NULL AND btrim(c.contributor) <> '' AND c.is_individual = false
)
INSERT INTO public.donor_alias_members (alias_id, donor_name, donor_type)
SELECT a.id, mem.donor_name, mem.donor_type
FROM fresh f
JOIN public.donor_aliases a ON a.canonical_name = f.canonical
JOIN members mem ON mem.norm = f.norm
ON CONFLICT (donor_name, donor_type) DO NOTHING;

-- 3. Backfill federal donor rows that are now members so their stored display_name
-- reflects the canonical (NJ rows resolve live in donor_unified).
UPDATE public.donors d
SET display_name = a.canonical_name
FROM public.donor_alias_members m
JOIN public.donor_aliases a ON a.id = m.alias_id AND a.is_active = true
WHERE d.name = m.donor_name
  AND d.type::text = m.donor_type
  AND d.display_name IS DISTINCT FROM a.canonical_name;
