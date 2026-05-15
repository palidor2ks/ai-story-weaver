CREATE OR REPLACE FUNCTION public.search_raw_donors_by_name(p_search text, p_type text DEFAULT NULL, p_limit integer DEFAULT 100)
RETURNS TABLE(donor_name text, type text, total_amount bigint, transaction_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT d.name AS donor_name,
         d.type::text AS type,
         SUM(d.amount)::bigint AS total_amount,
         COUNT(*)::bigint AS transaction_count
  FROM public.donors d
  WHERE d.name ILIKE '%' || p_search || '%'
    AND (p_type IS NULL OR p_type = 'all' OR d.type::text = p_type)
  GROUP BY d.name, d.type
  ORDER BY SUM(d.amount) DESC NULLS LAST
  LIMIT GREATEST(LEAST(p_limit, 500), 1);
$$;