-- Drop the overloaded UUID version of get_contribution_totals to prevent RPC ambiguity
-- This ensures reconciliation calls use the correct (text, text) version
DROP FUNCTION IF EXISTS public.get_contribution_totals(uuid, text);