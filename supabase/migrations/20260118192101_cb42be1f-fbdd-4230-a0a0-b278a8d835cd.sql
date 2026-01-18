CREATE OR REPLACE FUNCTION public.get_contribution_totals_by_committee(p_committee_id text, p_cycle text)
 RETURNS TABLE(itemized_total bigint, itemized_gross bigint, individual_itemized bigint, individual_gross bigint, pac_total bigint, party_total bigint, organization_total bigint, transfers_total bigint, other_total bigint, earmarked_total bigint, memo_x_total bigint, loans_total bigint, donor_count bigint, contribution_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    -- Net itemized (excluding memo_code='X' and transfers, Line 11 only)
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '11%' AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as itemized_total,
    
    -- Gross itemized (including memo_code='X', excluding transfers, Line 11 only)
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '11%'
      THEN amount ELSE 0 
    END), 0)::bigint as itemized_gross,
    
    -- Individual itemized (net, Line 11A only, contributor_type = Individual)
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '11A%' AND contributor_type = 'Individual' AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as individual_itemized,
    
    -- Individual gross (Line 11A including memo_code='X', contributor_type = Individual)
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '11A%' AND contributor_type = 'Individual'
      THEN amount ELSE 0 
    END), 0)::bigint as individual_gross,
    
    -- PAC contributions (Line 11C - use line_number, not contributor_type)
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '11C%' AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as pac_total,
    
    -- Party contributions (Line 11B - use line_number, not contributor_type)
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '11B%' AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as party_total,
    
    -- Organization contributions (Line 11A, non-Individual types)
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '11A%' AND contributor_type IN ('Organization', 'Unknown') AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as organization_total,
    
    -- Transfers (Line 12)
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '12%' AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as transfers_total,
    
    -- Other receipts (Lines 14 + 15 - includes offsets to operating expenditures)
    COALESCE(SUM(CASE 
      WHEN (line_number ILIKE '14%' OR line_number ILIKE '15%') AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as other_total,
    
    -- Earmarked contributions
    COALESCE(SUM(CASE 
      WHEN is_earmarked = true AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as earmarked_total,
    
    -- Memo code X total (for reconciliation)
    COALESCE(SUM(CASE 
      WHEN memo_code = 'X'
      THEN amount ELSE 0 
    END), 0)::bigint as memo_x_total,
    
    -- Loans (Line 13)
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '13%' AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as loans_total,
    
    -- Unique donor count
    COUNT(DISTINCT contributor_name)::bigint as donor_count,
    
    -- Total contribution count
    COUNT(*)::bigint as contribution_count
    
  FROM contributions
  WHERE recipient_committee_id = p_committee_id
    AND cycle = p_cycle;
END;
$function$;