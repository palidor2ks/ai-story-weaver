
-- 1. fec_candidates: restrict authenticated to non-PII columns (anon was already restricted).
DO $$
BEGIN
  IF to_regclass('public.fec_candidates') IS NOT NULL THEN
    REVOKE SELECT ON public.fec_candidates FROM authenticated;
    GRANT SELECT (
      fec_candidate_id, cycle, name, party, election_year, office,
      office_state, office_district, incumbent_challenger, status,
      principal_committee_id, source, updated_at
    ) ON public.fec_candidates TO authenticated;
  END IF;
END $$;

-- 2. Enable RLS on internal enrichment staging tables. No policies = deny-all to
--    anon/authenticated. Service role bypasses RLS so background jobs continue.
--    These tables are created ad-hoc by enrichment scripts (not by a migration), so guard
--    each with to_regclass — same pattern as statement 1 — so a from-scratch replay (Supabase
--    preview branches) skips the missing tables instead of failing with 42P01. On prod, where
--    the tables exist, the end state is identical.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    '_enrich_bill_kw', '_enrich_member_bills', '_enrich_t2_hits',
    '_enrich_vc_keywords', '_enrich_vc_tier2'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    END IF;
  END LOOP;
END $$;
