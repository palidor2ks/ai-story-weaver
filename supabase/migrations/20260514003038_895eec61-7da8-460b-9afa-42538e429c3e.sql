CREATE OR REPLACE FUNCTION public.get_donor_cycles()
RETURNS TABLE(cycle text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT cycle::text
  FROM public.donors
  WHERE cycle IS NOT NULL
  ORDER BY cycle::text DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_donor_cycles() TO anon, authenticated;