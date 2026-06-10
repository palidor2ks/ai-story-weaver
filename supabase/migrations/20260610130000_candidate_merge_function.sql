-- Candidate de-duplication: candidate_merge_map + merge_candidate().
--
-- Background (docs/candidate-deduplication-plan.md): the same real person can exist as
-- two+ candidates rows — e.g. Seth Moulton as both M001196 (House incumbent, bioguide-keyed)
-- and S6MA00296 (Senate candidacy, FEC-keyed). ~35 clusters exist; all 31 shared-committee
-- clusters have mismatched person_ids. The onboarding-side prevention landed separately
-- (committee-based resolution in _shared/onboard-candidate.ts); this migration provides the
-- CLEANUP tool for the duplicates that already exist.
--
-- What applying this migration does: creates one empty table and three functions. It moves
-- NO data by itself. Merges happen only when an operator (service role) later:
--   1. inserts reviewed (canonical_id, dup_id) pairs into candidate_merge_map,
--   2. inspects merge_candidate(canonical, dup) dry-run reports (p_dry_run defaults to TRUE),
--   3. flips rows to status='approved' and runs run_approved_candidate_merges(p_dry_run := false).
--
-- Merge semantics (all inside one transaction per pair — all-or-nothing):
--   • Conflict-keyed child tables (unique keys involving candidate_id): re-point the dup's
--     rows to the canonical UNLESS the canonical already has a row with the same key; the
--     canonical's row wins and the dup's conflicting row is deleted. Counts are reported.
--   • Plain child tables: blind re-point candidate_id (contributions is protected against
--     double-ingest by its own UNIQUE (identity_hash, cycle); we additionally refuse to merge
--     when the same fec_transaction_id exists under both ids, unless p_force).
--   • The dup's FEC candidate id(s) are preserved as candidate_fec_ids aliases on the
--     canonical, so both the House and Senate FEC ids resolve to one person forever.
--   • person_id is unified: references to the dup's person are re-pointed and the orphaned
--     persons row is removed.
--   • Display carry-over: the canonical adopts the dup's image_url only if it has none.
--   • The dup's candidates row is deleted last.

-- ---------------------------------------------------------------------------
-- 1) Review worklist / audit log. RLS enabled with NO policies: clients (anon/auth) get
--    nothing; only the service role (admin tooling, SQL editor) can read or write it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.candidate_merge_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_id text NOT NULL REFERENCES public.candidates(id),
  dup_id text NOT NULL,
  merge_type text NOT NULL CHECK (merge_type IN
    ('bioguide_fec', 'fec_cross_office', 'fec_same_office', 'ai_pair', 'manual')),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN
    ('proposed', 'approved', 'merged', 'rejected')),
  notes text,
  report jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  merged_at timestamptz,
  UNIQUE (canonical_id, dup_id)
);

ALTER TABLE public.candidate_merge_map ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2) The merge function. SECURITY DEFINER + pinned search_path, service-role-only by
--    EXECUTE grant (revoked from anon/authenticated below).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_candidate(
  p_canonical_id text,
  p_dup_id text,
  p_dry_run boolean DEFAULT true,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '300000'
AS $function$
DECLARE
  v_canonical public.candidates%ROWTYPE;
  v_dup       public.candidates%ROWTYPE;
  v_report    jsonb := '{}'::jsonb;
  v_tables    jsonb := '{}'::jsonb;
  v_movable   bigint;
  v_conflicts bigint;
  v_count     bigint;
  v_overlap   bigint;
  v_match     text;
  v_tbl       text;
  r           record;
  -- Conflict-keyed tables: unique key columns besides candidate_id. '{}' means the unique
  -- key is candidate_id alone (at most one row per candidate; canonical's wins).
  -- profile_claims is intentionally absent — handled specially below because of its
  -- partial unique index (one live claim per candidate WHERE status IN pending/approved).
  c_keyed CONSTANT jsonb := '{
    "candidate_answers":      ["question_id"],
    "candidate_committees":   ["fec_committee_id"],
    "candidate_fec_ids":      ["fec_candidate_id"],
    "candidate_overrides":    [],
    "candidate_topic_scores": ["topic_id"],
    "candidate_votes":        ["bill_id", "action_type", "vote_number"],
    "election_candidates":    ["election_id"],
    "finance_reconciliation": ["cycle"],
    "pac_candidate_totals":   ["committee_id", "cycle"],
    "pac_expenditures":       ["committee_id", "support_oppose", "cycle"],
    "user_rep_comparisons":   ["user_id"],
    "vote_sync_status":       []
  }'::jsonb;
  -- Plain re-points: no unique key involves candidate_id, so UPDATE cannot conflict.
  c_plain CONSTANT text[] := ARRAY[
    'contributions', 'donors', 'donor_import_sessions', 'committee_finance_rollups',
    'external_committee_finance', 'independent_expenditures', 'representative_social_posts'
  ];
BEGIN
  -- ----- validations ---------------------------------------------------------------------
  IF p_canonical_id = p_dup_id THEN
    RAISE EXCEPTION 'merge_candidate: canonical and dup are the same id (%)', p_canonical_id;
  END IF;
  SELECT * INTO v_canonical FROM public.candidates WHERE id = p_canonical_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_candidate: canonical candidate % not found', p_canonical_id;
  END IF;
  SELECT * INTO v_dup FROM public.candidates WHERE id = p_dup_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_candidate: dup candidate % not found', p_dup_id;
  END IF;

  -- Double-ingest guard: contributions has UNIQUE (identity_hash, cycle), so the same row
  -- cannot exist twice — but if the same FEC transaction was somehow ingested once under
  -- each candidate id (different identity_hash inputs), re-pointing would double-count it.
  SELECT count(*) INTO v_overlap
  FROM public.contributions a
  JOIN public.contributions b
    ON b.fec_transaction_id = a.fec_transaction_id AND b.cycle = a.cycle
  WHERE a.candidate_id = p_dup_id
    AND b.candidate_id = p_canonical_id
    AND a.fec_transaction_id IS NOT NULL;
  IF v_overlap > 0 AND NOT p_force AND NOT p_dry_run THEN
    RAISE EXCEPTION
      'merge_candidate: % contributions share fec_transaction_id between % and % — possible double-ingest; resolve or pass p_force := true',
      v_overlap, p_dup_id, p_canonical_id;
  END IF;

  -- ----- report: what would move ---------------------------------------------------------
  FOR r IN SELECT key AS tbl, value AS keys FROM jsonb_each(c_keyed) LOOP
    -- Conflict = canonical already has a row with the same non-candidate key columns.
    SELECT CASE WHEN jsonb_array_length(r.keys) = 0 THEN 'true'
           ELSE (SELECT string_agg(format('x.%I = t.%I', k, k), ' AND ')
                 FROM jsonb_array_elements_text(r.keys) k) END
    INTO v_match;
    EXECUTE format(
      'SELECT count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.%I x WHERE x.candidate_id = $2 AND %s)),
              count(*) FILTER (WHERE     EXISTS (SELECT 1 FROM public.%I x WHERE x.candidate_id = $2 AND %s))
       FROM public.%I t WHERE t.candidate_id = $1', r.tbl, v_match, r.tbl, v_match, r.tbl)
    INTO v_movable, v_conflicts
    USING p_dup_id, p_canonical_id;
    v_tables := v_tables || jsonb_build_object(r.tbl,
      jsonb_build_object('move', v_movable, 'conflict_drop', v_conflicts));
  END LOOP;

  FOREACH v_tbl IN ARRAY c_plain LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE candidate_id = $1', v_tbl)
    INTO v_count USING p_dup_id;
    v_tables := v_tables || jsonb_build_object(v_tbl, jsonb_build_object('move', v_count));
  END LOOP;

  SELECT count(*) INTO v_count FROM public.profile_claims WHERE candidate_id = p_dup_id;
  v_tables := v_tables || jsonb_build_object('profile_claims', jsonb_build_object('move', v_count));

  v_report := jsonb_build_object(
    'canonical_id', p_canonical_id,
    'dup_id', p_dup_id,
    'dry_run', p_dry_run,
    'fec_transaction_overlap', v_overlap,
    'tables', v_tables
  );

  IF p_dry_run THEN
    RETURN v_report;
  END IF;

  -- ----- execute (single transaction; any error rolls back everything) -------------------
  FOR r IN SELECT key AS tbl, value AS keys FROM jsonb_each(c_keyed) LOOP
    SELECT CASE WHEN jsonb_array_length(r.keys) = 0 THEN 'true'
           ELSE (SELECT string_agg(format('x.%I = t.%I', k, k), ' AND ')
                 FROM jsonb_array_elements_text(r.keys) k) END
    INTO v_match;
    EXECUTE format(
      'UPDATE public.%I t SET candidate_id = $2 WHERE t.candidate_id = $1
         AND NOT EXISTS (SELECT 1 FROM public.%I x WHERE x.candidate_id = $2 AND %s)',
      r.tbl, r.tbl, v_match)
    USING p_dup_id, p_canonical_id;
    -- Conflicting leftovers: the canonical's row wins; drop the dup's.
    EXECUTE format('DELETE FROM public.%I WHERE candidate_id = $1', r.tbl) USING p_dup_id;
  END LOOP;

  -- profile_claims: respect both UNIQUE (candidate_id, user_id) and the partial unique
  -- "one live (pending/approved) claim per candidate". A dup live claim moves only if the
  -- canonical has no live claim; otherwise it is dropped (the canonical's claim wins).
  UPDATE public.profile_claims t SET candidate_id = p_canonical_id
  WHERE t.candidate_id = p_dup_id
    AND NOT EXISTS (SELECT 1 FROM public.profile_claims x
                    WHERE x.candidate_id = p_canonical_id AND x.user_id = t.user_id)
    AND NOT (t.status IN ('pending', 'approved') AND EXISTS (
          SELECT 1 FROM public.profile_claims x
          WHERE x.candidate_id = p_canonical_id AND x.status IN ('pending', 'approved')));
  DELETE FROM public.profile_claims WHERE candidate_id = p_dup_id;

  FOREACH v_tbl IN ARRAY c_plain LOOP
    EXECUTE format('UPDATE public.%I SET candidate_id = $2 WHERE candidate_id = $1', v_tbl)
    USING p_dup_id, p_canonical_id;
  END LOOP;

  -- Preserve the dup's FEC identity as aliases on the canonical so both ids resolve to one
  -- person on every future ingest (closes the loop with the onboarding-side prevention).
  INSERT INTO public.candidate_fec_ids
    (candidate_id, fec_candidate_id, office, state, district, is_primary, match_method)
  SELECT p_canonical_id, f.fec_id,
         CASE left(f.fec_id, 1) WHEN 'S' THEN 'Senate' WHEN 'H' THEN 'House'
                                WHEN 'P' THEN 'President' ELSE NULL END,
         v_dup.state, v_dup.district, false, 'merge'
  FROM (SELECT DISTINCT fec_id FROM unnest(ARRAY[v_dup.fec_candidate_id, v_dup.id]) AS fec_id
        WHERE fec_id ~ '^[HSP]\d[A-Z]{2}\d+$') f
  ON CONFLICT (candidate_id, fec_candidate_id) DO NOTHING;

  -- Display carry-over: adopt the dup's photo only if the canonical has none.
  UPDATE public.candidates
  SET image_url = COALESCE(image_url, v_dup.image_url)
  WHERE id = p_canonical_id;

  -- Unify person identity. The dup's person row was minted by the office-scoped
  -- resolve_person; re-point everything to the canonical's person, then remove the orphan.
  IF v_dup.person_id IS NOT NULL AND v_dup.person_id IS DISTINCT FROM v_canonical.person_id THEN
    IF v_canonical.person_id IS NULL THEN
      UPDATE public.candidates SET person_id = v_dup.person_id WHERE id = p_canonical_id;
    ELSE
      UPDATE public.election_candidates SET person_id = v_canonical.person_id
      WHERE person_id = v_dup.person_id;
      UPDATE public.static_officials SET person_id = v_canonical.person_id
      WHERE person_id = v_dup.person_id;
      UPDATE public.candidates SET person_id = v_canonical.person_id
      WHERE person_id = v_dup.person_id;
      DELETE FROM public.persons p
      WHERE p.id = v_dup.person_id
        AND NOT EXISTS (SELECT 1 FROM public.candidates        WHERE person_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM public.election_candidates WHERE person_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM public.static_officials  WHERE person_id = p.id);
    END IF;
  END IF;

  DELETE FROM public.candidates WHERE id = p_dup_id;

  INSERT INTO public.candidate_merge_map (canonical_id, dup_id, merge_type, status, report, merged_at)
  VALUES (p_canonical_id, p_dup_id, 'manual', 'merged', v_report, now())
  ON CONFLICT (canonical_id, dup_id)
  DO UPDATE SET status = 'merged', report = EXCLUDED.report, merged_at = now();

  RETURN v_report;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3) Batch runner over reviewed+approved map rows. Dry-run by default; each merge is its
--    own subtransaction-free call, so one failing pair aborts the whole batch (deliberate:
--    investigate, fix, re-run — no partially-merged worklists).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_approved_candidate_merges(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '600000'
AS $function$
DECLARE
  v_out jsonb := '[]'::jsonb;
  r record;
BEGIN
  FOR r IN
    SELECT canonical_id, dup_id FROM public.candidate_merge_map
    WHERE status = 'approved' ORDER BY created_at
  LOOP
    v_out := v_out || jsonb_build_array(
      public.merge_candidate(r.canonical_id, r.dup_id, p_dry_run));
  END LOOP;
  RETURN v_out;
END;
$function$;

-- Service-role only: these move user-visible data and must never be callable from clients.
REVOKE EXECUTE ON FUNCTION public.merge_candidate(text, text, boolean, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_approved_candidate_merges(boolean)
  FROM PUBLIC, anon, authenticated;
