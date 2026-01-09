-- Update refresh function to set longer statement timeout
CREATE OR REPLACE FUNCTION public.refresh_bill_summary_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Set 5 minute statement timeout for this refresh operation
  PERFORM set_config('statement_timeout', '300000', true);
  -- Set 30 second lock timeout to avoid waiting forever
  PERFORM set_config('lock_timeout', '30000', true);
  
  REFRESH MATERIALIZED VIEW CONCURRENTLY bill_summary_stats;
END;
$$;