-- Drop existing function first to change return type
DROP FUNCTION IF EXISTS public.get_contribution_totals_by_committee(text, text);

-- Recreate get_contribution_totals_by_committee with Line 14 included in other_total
CREATE OR REPLACE FUNCTION public.get_contribution_totals_by_committee(p_committee_id text, p_cycle text)
RETURNS TABLE(
  itemized_total bigint,
  itemized_gross bigint,
  individual_itemized bigint,
  individual_gross bigint,
  pac_total bigint,
  party_total bigint,
  organization_total bigint,
  transfers_total bigint,
  other_total bigint,
  earmarked_total bigint,
  memo_x_total bigint,
  loans_total bigint,
  donor_count bigint,
  contribution_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- Net itemized (excluding memo_code='X' and transfers)
    COALESCE(SUM(CASE 
      WHEN line_number LIKE '11%' AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as itemized_total,
    
    -- Gross itemized (including memo_code='X', excluding transfers)
    COALESCE(SUM(CASE 
      WHEN line_number LIKE '11%'
      THEN amount ELSE 0 
    END), 0)::bigint as itemized_gross,
    
    -- Individual itemized (net, Line 11A only)
    COALESCE(SUM(CASE 
      WHEN line_number LIKE '11%' AND contributor_type = 'Individual' AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as individual_itemized,
    
    -- Individual gross (Line 11A including memo_code='X')
    COALESCE(SUM(CASE 
      WHEN line_number LIKE '11%' AND contributor_type = 'Individual'
      THEN amount ELSE 0 
    END), 0)::bigint as individual_gross,
    
    -- PAC contributions (Line 11C)
    COALESCE(SUM(CASE 
      WHEN line_number LIKE '11%' AND contributor_type = 'Committee' AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as pac_total,
    
    -- Party contributions (Line 11B)
    COALESCE(SUM(CASE 
      WHEN line_number LIKE '11%' AND contributor_type = 'Party' AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as party_total,
    
    -- Organization contributions
    COALESCE(SUM(CASE 
      WHEN line_number LIKE '11%' AND contributor_type = 'Organization' AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as organization_total,
    
    -- Transfers (Line 12)
    COALESCE(SUM(CASE 
      WHEN line_number LIKE '12%' AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as transfers_total,
    
    -- Other receipts (Lines 14 + 15 - now includes offsets to operating expenditures)
    COALESCE(SUM(CASE 
      WHEN (line_number LIKE '14%' OR line_number LIKE '15%') AND (memo_code IS NULL OR memo_code != 'X')
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
      WHEN line_number LIKE '13%' AND (memo_code IS NULL OR memo_code != 'X')
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
$$;