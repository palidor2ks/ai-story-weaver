-- Drop and recreate functions to fix organization_total calculation
-- Revert to exclude PAC contributions on Line 11A (FEC doesn't include them in individual_itemized)

DROP FUNCTION IF EXISTS public.get_contribution_totals(uuid, text);
DROP FUNCTION IF EXISTS public.get_contribution_totals_by_committee(text, text);

-- Recreate get_contribution_totals function
CREATE FUNCTION public.get_contribution_totals(p_candidate_id uuid, p_cycle text)
RETURNS TABLE(
  individual_total bigint,
  individual_gross bigint,
  organization_total bigint,
  pac_total bigint,
  party_total bigint,
  transfer_total bigint,
  loan_total bigint,
  other_total bigint,
  earmarked_total bigint,
  memo_x_total bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '11A%' 
        AND (memo_code IS NULL OR memo_code != 'X')
        AND contributor_type = 'Individual'
      THEN amount ELSE 0 
    END), 0)::bigint as individual_total,
    
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '11A%' 
        AND contributor_type = 'Individual'
      THEN amount ELSE 0 
    END), 0)::bigint as individual_gross,
    
    -- REVERTED: Only Organization and Unknown, NOT PAC
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '11A%' 
        AND (memo_code IS NULL OR memo_code != 'X')
        AND contributor_type IN ('Organization', 'Unknown')
      THEN amount ELSE 0 
    END), 0)::bigint as organization_total,
    
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '11C%'
        AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as pac_total,
    
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '11B%'
        AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as party_total,
    
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '12%'
        AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as transfer_total,
    
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '13%'
        AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as loan_total,
    
    COALESCE(SUM(CASE 
      WHEN (line_number ILIKE '14%' OR line_number ILIKE '15%' OR line_number ILIKE '16%' OR line_number ILIKE '17%')
        AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as other_total,
    
    COALESCE(SUM(CASE 
      WHEN is_earmarked = true
        AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as earmarked_total,
    
    COALESCE(SUM(CASE 
      WHEN memo_code = 'X'
      THEN amount ELSE 0 
    END), 0)::bigint as memo_x_total
    
  FROM contributions
  WHERE candidate_id = p_candidate_id
    AND cycle = p_cycle;
END;
$$;

-- Recreate get_contribution_totals_by_committee function
CREATE FUNCTION public.get_contribution_totals_by_committee(p_committee_id text, p_cycle text)
RETURNS TABLE(
  individual_total bigint,
  individual_gross bigint,
  organization_total bigint,
  pac_total bigint,
  party_total bigint,
  transfer_total bigint,
  loan_total bigint,
  other_total bigint,
  earmarked_total bigint,
  memo_x_total bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '11A%' 
        AND (memo_code IS NULL OR memo_code != 'X')
        AND contributor_type = 'Individual'
      THEN amount ELSE 0 
    END), 0)::bigint as individual_total,
    
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '11A%' 
        AND contributor_type = 'Individual'
      THEN amount ELSE 0 
    END), 0)::bigint as individual_gross,
    
    -- REVERTED: Only Organization and Unknown, NOT PAC
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '11A%' 
        AND (memo_code IS NULL OR memo_code != 'X')
        AND contributor_type IN ('Organization', 'Unknown')
      THEN amount ELSE 0 
    END), 0)::bigint as organization_total,
    
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '11C%'
        AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as pac_total,
    
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '11B%'
        AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as party_total,
    
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '12%'
        AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as transfer_total,
    
    COALESCE(SUM(CASE 
      WHEN line_number ILIKE '13%'
        AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as loan_total,
    
    COALESCE(SUM(CASE 
      WHEN (line_number ILIKE '14%' OR line_number ILIKE '15%' OR line_number ILIKE '16%' OR line_number ILIKE '17%')
        AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as other_total,
    
    COALESCE(SUM(CASE 
      WHEN is_earmarked = true
        AND (memo_code IS NULL OR memo_code != 'X')
      THEN amount ELSE 0 
    END), 0)::bigint as earmarked_total,
    
    COALESCE(SUM(CASE 
      WHEN memo_code = 'X'
      THEN amount ELSE 0 
    END), 0)::bigint as memo_x_total
    
  FROM contributions
  WHERE recipient_committee_id = p_committee_id
    AND cycle = p_cycle;
END;
$$;