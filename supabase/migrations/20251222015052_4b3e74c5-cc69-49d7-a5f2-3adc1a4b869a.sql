-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- Create a new policy that explicitly requires authentication.
-- Drop the same-named policy first so this migration is idempotent on a from-scratch
-- replay (Supabase preview branches): without this guard the bare CREATE POLICY fails
-- with 42710 "policy already exists". Same end state as before.
DROP POLICY IF EXISTS "Authenticated users can view their own profile" ON public.profiles;
CREATE POLICY "Authenticated users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);