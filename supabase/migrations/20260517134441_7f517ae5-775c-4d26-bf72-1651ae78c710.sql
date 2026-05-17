-- 1. profiles: prevent owner from reassigning row.id to another user
DROP POLICY IF EXISTS "Authenticated users can update their own profile" ON public.profiles;
CREATE POLICY "Authenticated users can update their own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 2. candidate_overrides: block non-admin politicians from setting scoring/audit columns at INSERT time
DROP POLICY IF EXISTS "Politicians can insert their claimed candidate overrides" ON public.candidate_overrides;
CREATE POLICY "Politicians can insert their claimed candidate overrides"
  ON public.candidate_overrides
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.id = candidate_overrides.candidate_id
        AND c.claimed_by_user_id = auth.uid()
    )
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR (
        overall_score IS NULL
        AND coverage_tier IS NULL
        AND confidence IS NULL
        AND created_by IS NULL
        AND updated_by IS NULL
      )
    )
  );