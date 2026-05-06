
-- Drop the existing overly permissive INSERT policy
DROP POLICY IF EXISTS "Allow insert for audit logging" ON public.profile_access_log;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.profile_access_log;

-- Only the trigger (which runs as SECURITY DEFINER) needs to insert
-- No direct user inserts should be allowed
-- Create a restrictive policy that only allows service_role
CREATE POLICY "Only service_role can insert audit logs"
ON public.profile_access_log
FOR INSERT
TO service_role
WITH CHECK (true);
