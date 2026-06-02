-- Keep profiles.age in sync when birth_date is set.
-- age is entered manually by users (demographic field) and becomes stale over time.
-- When birth_date is available (set during voter verification), we derive age from it
-- so verified users always show their current age.

CREATE OR REPLACE FUNCTION public.tg_sync_age_from_birth_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.birth_date IS NOT NULL THEN
    NEW.age := EXTRACT(YEAR FROM AGE(NOW(), NEW.birth_date::date))::integer;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_age_from_birth_date ON public.profiles;
CREATE TRIGGER sync_age_from_birth_date
  BEFORE INSERT OR UPDATE OF birth_date ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_age_from_birth_date();

-- Backfill: recompute age for any user who already has birth_date set.
UPDATE public.profiles
SET age = EXTRACT(YEAR FROM AGE(NOW(), birth_date::date))::integer
WHERE birth_date IS NOT NULL;
