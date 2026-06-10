-- Candidate-merge proposals generator.
--
-- NOT a migration. Run manually (service role) AFTER 20260610130000_candidate_merge_function.sql
-- is applied, then REVIEW every row before flipping any status to 'approved'. Nothing merges
-- until run_approved_candidate_merges(p_dry_run := false) is run deliberately — and each pair
-- should be dry-run inspected first:
--
--   1. \i scripts/candidate-merge-proposals.sql            -- seed status='proposed' rows
--   2. SELECT * FROM candidate_merge_map WHERE status='proposed';   -- human review
--   3. SELECT merge_candidate(canonical_id, dup_id) FROM candidate_merge_map
--      WHERE status='proposed';                            -- dry-run reports (no changes)
--   4. UPDATE candidate_merge_map SET status='approved' WHERE ...;  -- per-pair, deliberate
--   5. SELECT run_approved_candidate_merges(p_dry_run := false);
--
-- Sources of truth (docs/candidate-deduplication-plan.md §3):
--   Signal A — one active principal committee linked to two candidate ids (strongest: FEC
--              assigns one principal committee per person across offices).
--   Signal B — same normalized name + state (weaker; verify before approving).
-- Type E (shared committee but DIFFERENT states) is never proposed — listed at the end for
-- manual FEC verification instead.

-- ---------------------------------------------------------------------------
-- Signal A: shared active committee. Canonical preference: bioguide-keyed row
-- (has votes/photo/answers) > incumbent > has photo > older row.
-- ---------------------------------------------------------------------------
WITH clusters AS (
  SELECT fec_committee_id, array_agg(DISTINCT candidate_id) AS ids
  FROM candidate_committees
  WHERE active = true
  GROUP BY fec_committee_id
  HAVING count(DISTINCT candidate_id) = 2
),
pairs AS (
  SELECT c.fec_committee_id,
         a.id AS id_a, a.state AS state_a, a.is_incumbent AS inc_a, a.image_url AS img_a, a.created_at AS at_a,
         b.id AS id_b, b.state AS state_b, b.is_incumbent AS inc_b, b.image_url AS img_b, b.created_at AS at_b
  FROM clusters c
  JOIN candidates a ON a.id = c.ids[1]
  JOIN candidates b ON b.id = c.ids[2]
),
ranked AS (
  SELECT *,
    (id_a ~ '^[A-Z]\d{6}$') AS bio_a,
    (id_b ~ '^[A-Z]\d{6}$') AS bio_b
  FROM pairs
  WHERE state_a = state_b  -- Type E (cross-state) handled separately below
)
INSERT INTO candidate_merge_map (canonical_id, dup_id, merge_type, notes)
SELECT
  CASE WHEN bio_a AND NOT bio_b THEN id_a
       WHEN bio_b AND NOT bio_a THEN id_b
       WHEN inc_a AND NOT inc_b THEN id_a
       WHEN inc_b AND NOT inc_a THEN id_b
       WHEN img_a IS NOT NULL AND img_b IS NULL THEN id_a
       WHEN img_b IS NOT NULL AND img_a IS NULL THEN id_b
       WHEN at_a <= at_b THEN id_a ELSE id_b END,
  CASE WHEN bio_a AND NOT bio_b THEN id_b
       WHEN bio_b AND NOT bio_a THEN id_a
       WHEN inc_a AND NOT inc_b THEN id_b
       WHEN inc_b AND NOT inc_a THEN id_a
       WHEN img_a IS NOT NULL AND img_b IS NULL THEN id_b
       WHEN img_b IS NOT NULL AND img_a IS NULL THEN id_a
       WHEN at_a <= at_b THEN id_b ELSE id_a END,
  CASE WHEN bio_a <> bio_b THEN 'bioguide_fec'
       WHEN left(id_a, 1) <> left(id_b, 1) THEN 'fec_cross_office'
       ELSE 'fec_same_office' END,
  'signal A: shared active committee ' || fec_committee_id
FROM ranked
ON CONFLICT (canonical_id, dup_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Signal B: same normalized name + state, no shared committee (weaker evidence — the note
-- says so; verify each one before approving). Includes the ai_* state/local pairs.
-- ---------------------------------------------------------------------------
WITH canon AS (
  SELECT id, state, name, is_incumbent, image_url, created_at,
    array_to_string((SELECT array_agg(t ORDER BY t)
      FROM unnest(string_to_array(
        lower(regexp_replace(replace(name, ',', ' '), '\s+', ' ', 'g')), ' ')) t
      WHERE t <> ''), ' ') AS token_key
  FROM candidates
),
pairs AS (
  SELECT a.id AS id_a, a.is_incumbent AS inc_a, a.image_url AS img_a, a.created_at AS at_a,
         b.id AS id_b, b.is_incumbent AS inc_b, b.image_url AS img_b, b.created_at AS at_b
  FROM canon a
  JOIN canon b ON b.token_key = a.token_key
    AND b.state IS NOT DISTINCT FROM a.state
    AND b.id > a.id
  WHERE NOT EXISTS (  -- already proposed via signal A
    SELECT 1 FROM candidate_merge_map m
    WHERE (m.canonical_id, m.dup_id) IN ((a.id, b.id), (b.id, a.id))
  )
)
INSERT INTO candidate_merge_map (canonical_id, dup_id, merge_type, notes)
SELECT
  CASE WHEN id_a ~ '^[A-Z]\d{6}$' AND id_b !~ '^[A-Z]\d{6}$' THEN id_a
       WHEN id_b ~ '^[A-Z]\d{6}$' AND id_a !~ '^[A-Z]\d{6}$' THEN id_b
       WHEN inc_a AND NOT inc_b THEN id_a
       WHEN inc_b AND NOT inc_a THEN id_b
       WHEN img_a IS NOT NULL AND img_b IS NULL THEN id_a
       WHEN img_b IS NOT NULL AND img_a IS NULL THEN id_b
       WHEN at_a <= at_b THEN id_a ELSE id_b END,
  CASE WHEN id_a ~ '^[A-Z]\d{6}$' AND id_b !~ '^[A-Z]\d{6}$' THEN id_b
       WHEN id_b ~ '^[A-Z]\d{6}$' AND id_a !~ '^[A-Z]\d{6}$' THEN id_a
       WHEN inc_a AND NOT inc_b THEN id_b
       WHEN inc_b AND NOT inc_a THEN id_a
       WHEN img_a IS NOT NULL AND img_b IS NULL THEN id_b
       WHEN img_b IS NOT NULL AND img_a IS NULL THEN id_a
       WHEN at_a <= at_b THEN id_b ELSE id_a END,
  CASE WHEN id_a LIKE 'ai\_%' AND id_b LIKE 'ai\_%' THEN 'ai_pair' ELSE 'manual' END,
  'signal B: name+state match only — verify same person before approving'
FROM pairs
ON CONFLICT (canonical_id, dup_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Type E — NOT proposed. Shared committee but different states: either a mis-linked
-- committee or two different people. Verify against fec.gov before doing anything.
-- ---------------------------------------------------------------------------
SELECT cc.fec_committee_id,
       array_agg(DISTINCT cc.candidate_id) AS candidate_ids,
       array_agg(DISTINCT c.state)         AS states,
       array_agg(DISTINCT c.name)          AS names
FROM candidate_committees cc
JOIN candidates c ON c.id = cc.candidate_id
WHERE cc.active = true
GROUP BY cc.fec_committee_id
HAVING count(DISTINCT cc.candidate_id) > 1 AND count(DISTINCT c.state) > 1;

-- Review what was seeded:
SELECT merge_type, status, count(*) FROM candidate_merge_map GROUP BY 1, 2 ORDER BY 1;
