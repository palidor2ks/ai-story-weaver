DROP POLICY IF EXISTS "user_badges own or public profile" ON public.user_badges;

CREATE POLICY "user_badges_select_own"
ON public.user_badges
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

REVOKE SELECT ON public.user_badges FROM anon;