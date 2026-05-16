-- Ensure return signatures can change safely when replaying migrations
DROP FUNCTION IF EXISTS public.get_contribution_totals(text, text);
DROP FUNCTION IF EXISTS public.get_contribution_totals_by_committee(text, text);

-- Update get_contribution_totals to exclude Line 13A (candidate loans) from itemized_total
CREATE OR REPLACE FUNCTION public.get_contribution_totals(p_candidate_id text, p_cycle text)
 RETURNS TABLE(individual_total bigint, pac_total bigint, party_total bigint, itemized_total bigint, transfers_total bigint, earmarked_total bigint, passthrough_total bigint, other_total bigint, loans_total bigint, contribution_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    
    -- Exclude Line 15 (other receipts), Line 13A (candidate loans), and memo_code='X' duplicates
    COALESCE(SUM(CASE 
      WHEN (memo_code IS NULL OR memo_code != 'X')
        AND (line_number IS NULL OR (line_number NOT LIKE '15%' AND line_number != '13A'))
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
    
    COALESCE(SUM(CASE 
      WHEN line_number LIKE '15%' AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as other_total,
    
    COALESCE(SUM(CASE 
      WHEN line_number = '13A' AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as loans_total,
    
    COUNT(*)::bigint as contribution_count
    
  FROM contributions
  WHERE candidate_id = p_candidate_id
    AND cycle = p_cycle
    AND is_contribution = true;
$function$;

-- Update get_contribution_totals_by_committee to exclude Line 13A from itemized_total
CREATE OR REPLACE FUNCTION public.get_contribution_totals_by_committee(p_candidate_id text, p_cycle text)
 RETURNS TABLE(committee_id text, individual_total bigint, pac_total bigint, party_total bigint, itemized_total bigint, transfers_total bigint, earmarked_total bigint, other_total bigint, loans_total bigint, contribution_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    recipient_committee_id as committee_id,
    
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
    
    -- Exclude Line 15 (other receipts), Line 13A (candidate loans), and memo_code='X' duplicates
    COALESCE(SUM(CASE 
      WHEN (memo_code IS NULL OR memo_code != 'X')
        AND (line_number IS NULL OR (line_number NOT LIKE '15%' AND line_number != '13A'))
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
      WHEN line_number LIKE '15%' AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as other_total,
    
    COALESCE(SUM(CASE 
      WHEN line_number = '13A' AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as loans_total,
    
    COUNT(*)::bigint as contribution_count
    
  FROM contributions
  WHERE candidate_id = p_candidate_id
    AND cycle = p_cycle
    AND is_contribution = true
  GROUP BY recipient_committee_id;
$function$;