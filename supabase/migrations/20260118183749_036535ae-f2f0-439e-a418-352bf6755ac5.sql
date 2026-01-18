-- Update get_contribution_totals to include Line 14 (offsets to operating expenditures) in other_total
CREATE OR REPLACE FUNCTION public.get_contribution_totals(p_candidate_id text, p_cycle text)
 RETURNS TABLE(individual_total bigint, pac_total bigint, party_total bigint, itemized_total bigint, transfers_total bigint, earmarked_total bigint, passthrough_total bigint, other_total bigint, loans_total bigint, organization_total bigint, contribution_count bigint, gross_individual_total bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '11A%' 
        AND (memo_code IS NULL OR memo_code != 'X')
        AND contributor_type = 'Individual'
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
      WHEN (memo_code IS NULL OR memo_code != 'X')
        AND (line_number IS NULL OR (
          line_number NOT LIKE '15%' 
          AND line_number NOT LIKE '14%'
          AND line_number NOT LIKE '12%' 
          AND line_number NOT IN ('13A', '11D')
        ))
      THEN amount ELSE 0 
    END), 0)::bigint as itemized_total,
    
    COALESCE(SUM(CASE 
      WHEN (line_number LIKE '12%' OR is_transfer = true) AND (memo_code IS NULL OR memo_code != 'X') 
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
    
    -- Other receipts (Lines 14 + 15 - now includes offsets to operating expenditures)
    COALESCE(SUM(CASE 
      WHEN (line_number LIKE '14%' OR line_number LIKE '15%') AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as other_total,
    
    COALESCE(SUM(CASE 
      WHEN line_number = '13A' AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as loans_total,
    
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '11A%' 
        AND (memo_code IS NULL OR memo_code != 'X')
        AND contributor_type IN ('Organization', 'Unknown')
      THEN amount ELSE 0 
    END), 0)::bigint as organization_total,
    
    COUNT(*)::bigint as contribution_count,
    
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '11A%' 
        AND contributor_type = 'Individual'
      THEN amount ELSE 0 
    END), 0)::bigint as gross_individual_total
    
  FROM contributions
  WHERE candidate_id = p_candidate_id
    AND cycle = p_cycle
    AND is_contribution = true;
$function$;