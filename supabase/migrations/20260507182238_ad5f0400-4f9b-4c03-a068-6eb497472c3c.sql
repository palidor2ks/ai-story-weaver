-- Drop the incorrect INSERT policy that allows all authenticated users to insert audit logs
-- The correct "Only service_role can insert audit logs" policy already exists
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.profile_access_log;