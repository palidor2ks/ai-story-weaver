-- Drop existing SELECT and INSERT policies
DROP POLICY IF EXISTS "Users can view their own claims" ON public.profile_claims;
DROP POLICY IF EXISTS "Users can submit claims" ON public.profile_claims;
DROP POLICY IF EXISTS "Admins can view all claims" ON public.profile_claims;

-- Recreate with explicit authentication requirement
CREATE POLICY "Authenticated users can view their own claims" 
ON public.profile_claims 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can submit claims" 
ON public.profile_claims 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all claims" 
ON public.profile_claims 
FOR SELECT 
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));