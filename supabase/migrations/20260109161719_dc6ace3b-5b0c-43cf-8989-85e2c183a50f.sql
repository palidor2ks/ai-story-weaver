-- Fix: Set statement_timeout as function attribute so it applies at invocation time
-- This bypasses PostgREST's connection-level timeout
CREATE OR REPLACE FUNCTION public.refresh_bill_summary_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '300000'
SET lock_timeout = '30000'
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY bill_summary_stats;
END;
$$;