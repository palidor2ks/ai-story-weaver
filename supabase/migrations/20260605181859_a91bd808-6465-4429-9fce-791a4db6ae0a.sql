
-- Restrict state-level contribution tables to authenticated users
DROP POLICY IF EXISTS fl_contributions_read ON public.fl_contributions;
CREATE POLICY fl_contributions_read ON public.fl_contributions FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.fl_contributions FROM anon;

DROP POLICY IF EXISTS nj_elec_contributions_read ON public.nj_elec_contributions;
CREATE POLICY nj_elec_contributions_read ON public.nj_elec_contributions FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.nj_elec_contributions FROM anon;

DROP POLICY IF EXISTS ny_contributions_read ON public.ny_contributions;
CREATE POLICY ny_contributions_read ON public.ny_contributions FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.ny_contributions FROM anon;

-- Prevent admins (or anyone) from changing profile id via UPDATE
CREATE OR REPLACE FUNCTION public.prevent_profile_id_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Changing profile id is not allowed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_id_change ON public.profiles;
CREATE TRIGGER profiles_prevent_id_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_id_change();
