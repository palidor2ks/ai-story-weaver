-- Lock down hidden_states: only admins can read/write the table directly.
DROP POLICY IF EXISTS "Hidden states readable by everyone" ON public.hidden_states;

-- Admins-only manage policy already exists ("Admins can manage hidden states").
-- Add an explicit admin-only SELECT for clarity (optional since FOR ALL covers it,
-- but kept explicit so intent is obvious).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.hidden_states'::regclass
      AND polname = 'Admins can read hidden states'
  ) THEN
    CREATE POLICY "Admins can read hidden states"
      ON public.hidden_states
      FOR SELECT
      USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- Public-safe RPC: returns just the list of hidden state codes.
-- SECURITY DEFINER bypasses RLS, but we only expose the codes (no metadata like hidden_by).
CREATE OR REPLACE FUNCTION public.get_hidden_state_codes()
RETURNS TABLE(state_code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT state_code FROM public.hidden_states;
$$;

GRANT EXECUTE ON FUNCTION public.get_hidden_state_codes() TO anon, authenticated;