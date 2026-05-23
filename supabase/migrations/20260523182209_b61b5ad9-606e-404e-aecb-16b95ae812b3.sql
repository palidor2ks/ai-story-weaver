
-- 1) ie_excluded_committees: drop public SELECT, add admin-only SELECT, expose safe view
DROP POLICY IF EXISTS "IE exclusions are publicly readable" ON public.ie_excluded_committees;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.ie_excluded_committees'::regclass
      AND polname = 'Admins can read IE exclusions'
  ) THEN
    CREATE POLICY "Admins can read IE exclusions"
      ON public.ie_excluded_committees
      FOR SELECT
      TO authenticated
      USING (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

CREATE OR REPLACE VIEW public.ie_excluded_committees_public
WITH (security_invoker = on) AS
SELECT fec_committee_id, reason, excluded_at
FROM public.ie_excluded_committees;

GRANT SELECT ON public.ie_excluded_committees_public TO anon, authenticated;

-- 2) share_cards: remove public SELECT (edge function reads via service role)
DROP POLICY IF EXISTS "Share cards are publicly readable" ON public.share_cards;

-- 3) candidate_overrides: block politicians from spoofing updated_by
DROP POLICY IF EXISTS "Politicians can update their claimed candidate overrides" ON public.candidate_overrides;

CREATE POLICY "Politicians can update their claimed candidate overrides"
ON public.candidate_overrides
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.candidates c
    WHERE c.id = candidate_overrides.candidate_id
      AND c.claimed_by_user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.candidates c
    WHERE c.id = candidate_overrides.candidate_id
      AND c.claimed_by_user_id = auth.uid()
  )
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      overall_score IS NOT DISTINCT FROM (SELECT co.overall_score FROM public.candidate_overrides co WHERE co.id = candidate_overrides.id)
      AND coverage_tier IS NOT DISTINCT FROM (SELECT co.coverage_tier FROM public.candidate_overrides co WHERE co.id = candidate_overrides.id)
      AND confidence IS NOT DISTINCT FROM (SELECT co.confidence FROM public.candidate_overrides co WHERE co.id = candidate_overrides.id)
      AND created_by IS NOT DISTINCT FROM (SELECT co.created_by FROM public.candidate_overrides co WHERE co.id = candidate_overrides.id)
      AND updated_by IS NOT DISTINCT FROM auth.uid()
    )
  )
);
