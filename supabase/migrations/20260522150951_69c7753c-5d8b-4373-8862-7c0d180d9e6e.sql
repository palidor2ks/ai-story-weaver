
-- 1. profile_claims: tighten INSERT to only allow pending claims by claimant, blocking self-approval
DROP POLICY IF EXISTS "Authenticated users can submit claims" ON public.profile_claims;
CREATE POLICY "Authenticated users can submit claims"
ON public.profile_claims
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND status = 'pending'
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
  AND rejection_reason IS NULL
);

-- 2. ie_excluded_committees: restrict excluded_by column to admins/service_role
REVOKE SELECT (excluded_by) ON public.ie_excluded_committees FROM anon, authenticated;

-- 3. poll_social_posts: allow service_role to read
CREATE POLICY "Service role can read poll_social_posts"
ON public.poll_social_posts
FOR SELECT
TO service_role
USING (true);

-- 4. share_cards: allow public read (hotlinked previews use unguessable IDs)
CREATE POLICY "Share cards are publicly readable"
ON public.share_cards
FOR SELECT
TO anon, authenticated
USING (true);
