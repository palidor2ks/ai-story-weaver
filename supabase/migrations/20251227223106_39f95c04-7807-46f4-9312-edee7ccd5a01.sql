-- Fix the view to use SECURITY INVOKER (default, but being explicit)
DROP VIEW IF EXISTS public.donor_consolidated;

CREATE VIEW public.donor_consolidated 
WITH (security_invoker = true)
AS
SELECT 
  COALESCE(da.canonical_name, d.name) as display_name,
  d.type,
  d.cycle,
  SUM(d.amount) as total_amount,
  SUM(COALESCE(d.transaction_count, 1)) as total_transactions,
  COUNT(DISTINCT d.candidate_id) as recipient_count,
  array_agg(DISTINCT d.name ORDER BY d.name) as name_variations,
  array_agg(DISTINCT d.id) as donor_ids,
  MIN(d.id) as primary_id,
  da.canonical_name IS NOT NULL as is_consolidated
FROM public.donors d
LEFT JOIN public.donor_aliases da 
  ON da.donor_type = d.type::text
  AND da.is_active = true
  AND LOWER(d.name) LIKE LOWER(da.alias_pattern)
GROUP BY COALESCE(da.canonical_name, d.name), d.type, d.cycle, da.canonical_name IS NOT NULL;