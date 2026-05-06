
-- 1. Restrict bill_sync_status to admins only
DROP POLICY IF EXISTS "Bill sync status is viewable by everyone" ON public.bill_sync_status;
CREATE POLICY "Only admins can view bill sync status"
ON public.bill_sync_status
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 2. Restrict vote_sync_status to admins only
DROP POLICY IF EXISTS "Vote sync status is viewable by everyone" ON public.vote_sync_status;
CREATE POLICY "Only admins can view vote sync status"
ON public.vote_sync_status
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 3. Revoke EXECUTE from anon on SECURITY DEFINER functions not meant for public use
REVOKE EXECUTE ON FUNCTION public.recalculate_all_coverage_tiers() FROM anon;
REVOKE EXECUTE ON FUNCTION public.recalculate_candidate_coverage(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.backfill_candidate_scores() FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_bill_summary_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_donor_display_names() FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_profile_modification() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_donor_display_name_trigger() FROM anon;
REVOKE EXECUTE ON FUNCTION public.count_donors_matching_patterns(text[], text[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_donor_display_name(text, text) FROM anon;

-- Also revoke from authenticated where only service_role/triggers should call them
REVOKE EXECUTE ON FUNCTION public.recalculate_all_coverage_tiers() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.backfill_candidate_scores() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_bill_summary_stats() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_donor_display_names() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.log_profile_modification() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_donor_display_name_trigger() FROM authenticated;

-- 4. Restrict avatars bucket listing - remove broad SELECT and add path-scoped policy
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images are publicly accessible by direct path"
ON storage.objects
FOR SELECT
USING (bucket_id = 'avatars' AND auth.role() = 'anon' AND name IS NOT NULL AND name != '');
