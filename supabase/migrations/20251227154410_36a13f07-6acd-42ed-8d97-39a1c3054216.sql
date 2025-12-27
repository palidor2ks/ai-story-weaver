-- Create a function to calculate contribution totals for reconciliation
-- This runs as SQL aggregation to avoid row limits
CREATE OR REPLACE FUNCTION public.get_contribution_totals(
  p_candidate_id text,
  p_cycle text
)
RETURNS TABLE (
  individual_total bigint,
  pac_total bigint,
  party_total bigint,
  itemized_total bigint,
  transfers_total bigint,
  earmarked_total bigint,
  passthrough_total bigint,
  contribution_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '11A%' AND (memo_code IS NULL OR memo_code != 'X') 
      THEN amount ELSE 0 
    END), 0)::bigint as individual_total,
    
    COALESCE(SUM(CASE 
      WHEN line_number = '11C' AND (memo_code IS NULL OR memo_code != 'X') 
      THEN amount ELSE 0 
    END), 0)::bigint as pac_total,
    
    COALESCE(SUM(CASE 
      WHEN line_number = '11B' AND (memo_code IS NULL OR memo_code != 'X') 
      THEN amount ELSE 0 
    END), 0)::bigint as party_total,
    
    COALESCE(SUM(CASE 
      WHEN memo_code IS NULL OR memo_code != 'X' 
      THEN amount ELSE 0 
    END), 0)::bigint as itemized_total,
    
    COALESCE(SUM(CASE 
      WHEN is_transfer = true AND (memo_code IS NULL OR memo_code != 'X') 
      THEN amount ELSE 0 
    END), 0)::bigint as transfers_total,
    
    COALESCE(SUM(CASE 
      WHEN is_earmarked = true AND (memo_code IS NULL OR memo_code != 'X') 
      THEN amount ELSE 0 
    END), 0)::bigint as earmarked_total,
    
    COALESCE(SUM(CASE 
      WHEN memo_text ILIKE '%SEE BELOW%' 
      THEN amount ELSE 0 
    END), 0)::bigint as passthrough_total,
    
    COUNT(*)::bigint as contribution_count
    
  FROM contributions
  WHERE candidate_id = p_candidate_id
    AND cycle = p_cycle
    AND is_contribution = true;
$$;