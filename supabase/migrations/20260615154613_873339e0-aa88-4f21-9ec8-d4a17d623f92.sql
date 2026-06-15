
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
ALTER TABLE public._enrich_bill_kw       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._enrich_member_bills  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._enrich_t2_hits       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._enrich_vc_keywords   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._enrich_vc_tier2      ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public._enrich_bill_kw      FROM anon, authenticated;
REVOKE ALL ON public._enrich_member_bills FROM anon, authenticated;
REVOKE ALL ON public._enrich_t2_hits      FROM anon, authenticated;
REVOKE ALL ON public._enrich_vc_keywords  FROM anon, authenticated;
REVOKE ALL ON public._enrich_vc_tier2     FROM anon, authenticated;

GRANT ALL ON public._enrich_bill_kw      TO service_role;
GRANT ALL ON public._enrich_member_bills TO service_role;
GRANT ALL ON public._enrich_t2_hits      TO service_role;
GRANT ALL ON public._enrich_vc_keywords  TO service_role;
GRANT ALL ON public._enrich_vc_tier2     TO service_role;
