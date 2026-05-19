
-- Harden candidate_overrides UPDATE policy: prevent politicians from writing score/coverage/confidence/audit fields
DROP POLICY IF EXISTS "Politicians can update their claimed candidate overrides" ON public.candidate_overrides;

CREATE POLICY "Politicians can update their claimed candidate overrides"
ON public.candidate_overrides
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM candidates c
    WHERE c.id = candidate_overrides.candidate_id
      AND c.claimed_by_user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM candidates c
    WHERE c.id = candidate_overrides.candidate_id
      AND c.claimed_by_user_id = auth.uid()
  )
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      overall_score IS NOT DISTINCT FROM (SELECT overall_score FROM public.candidate_overrides co WHERE co.id = candidate_overrides.id)
      AND coverage_tier IS NOT DISTINCT FROM (SELECT coverage_tier FROM public.candidate_overrides co WHERE co.id = candidate_overrides.id)
      AND confidence    IS NOT DISTINCT FROM (SELECT confidence    FROM public.candidate_overrides co WHERE co.id = candidate_overrides.id)
      AND created_by    IS NOT DISTINCT FROM (SELECT created_by    FROM public.candidate_overrides co WHERE co.id = candidate_overrides.id)
    )
  )
);

-- Explicit INSERT policy on share_cards: only authenticated users may insert and only for themselves
CREATE POLICY "Users can insert their own share cards"
ON public.share_cards
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());
