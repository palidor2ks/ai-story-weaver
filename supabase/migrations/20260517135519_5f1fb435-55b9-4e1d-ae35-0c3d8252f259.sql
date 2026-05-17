-- Fix "permission denied for materialized view donor_consolidated_all_mv"
-- The matviews live in the private schema; make the RPCs SECURITY DEFINER so
-- callers don't need direct privileges, and re-grant select to postgres for the definer.

ALTER FUNCTION public.get_donors_paginated(integer, integer, text, text, text, text, text, bigint)
  SECURITY DEFINER;

ALTER FUNCTION public.get_donor_cycles() SECURITY DEFINER;

-- Ensure the function owner (postgres) can read the recreated matviews
GRANT USAGE ON SCHEMA private TO postgres;
GRANT SELECT ON private.donor_consolidated_mv TO postgres;
GRANT SELECT ON private.donor_consolidated_all_mv TO postgres;

-- Allow the RPCs to be invoked from the client
GRANT EXECUTE ON FUNCTION public.get_donors_paginated(integer, integer, text, text, text, text, text, bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_donor_cycles() TO anon, authenticated;
