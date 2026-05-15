CREATE OR REPLACE FUNCTION public.refresh_donor_consolidated_mv()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
 SET statement_timeout TO '600000'
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY private.donor_consolidated_mv;
  REFRESH MATERIALIZED VIEW CONCURRENTLY private.donor_consolidated_all_mv;
END;
$function$;

-- One-time refresh now to fix Koch Industries (and any other previously attached aliases)
REFRESH MATERIALIZED VIEW CONCURRENTLY private.donor_consolidated_all_mv;