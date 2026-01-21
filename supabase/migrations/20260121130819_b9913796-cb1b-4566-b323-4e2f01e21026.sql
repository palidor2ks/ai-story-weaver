-- Fix PAC contributions on Line 11AI not being counted
-- Updates both RPC functions to recognize PAC contributions from both 11AI and 11C

CREATE OR REPLACE FUNCTION public.get_contribution_totals(p_candidate_id text, p_cycle text)
 RETURNS TABLE(individual_total numeric, organization_total numeric, pac_total numeric, party_total numeric, transfer_total numeric, loan_total numeric, other_total numeric, earmarked_total numeric, memo_x_total numeric, conduit_excluded numeric, pass_through_excluded numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    -- Individual contributions (Line 11AI, not memo_code='X', not pass-through)
    COALESCE(SUM(CASE 
      WHEN c.contributor_type = 'Individual' 
        AND c.line_number = '11AI'
        AND COALESCE(c.memo_code, '') != 'X'
        AND COALESCE(c.is_contribution, true) = true
        AND NOT (COALESCE(c.memo_text, '') ILIKE '%NOTE: ABOVE CONTRIBUTION%')
      THEN c.amount ELSE 0 
    END), 0)::numeric as individual_total,
    
    -- Organization contributions (Line 11AI, not memo_code='X', NOT a conduit, not pass-through, NOT PAC)
    COALESCE(SUM(CASE 
      WHEN c.contributor_type IN ('Organization', 'Unknown') 
        AND c.line_number = '11AI'
        AND COALESCE(c.memo_code, '') != 'X'
        AND COALESCE(c.is_contribution, true) = true
        AND NOT EXISTS (
          SELECT 1 FROM conduit_organizations co 
          WHERE co.is_active = true 
          AND UPPER(c.contributor_name) LIKE '%' || co.name || '%'
        )
        AND NOT (COALESCE(c.memo_text, '') ILIKE '%NOTE: ABOVE CONTRIBUTION%')
      THEN c.amount ELSE 0 
    END), 0)::numeric as organization_total,
    
    -- PAC contributions (Line 11AI or 11C, not pass-through)
    COALESCE(SUM(CASE 
      WHEN c.contributor_type = 'PAC'
        AND c.line_number IN ('11AI', '11C')
        AND COALESCE(c.memo_code, '') != 'X'
        AND COALESCE(c.is_contribution, true) = true
        AND NOT (COALESCE(c.memo_text, '') ILIKE '%NOTE: ABOVE CONTRIBUTION%')
      THEN c.amount ELSE 0 
    END), 0)::numeric as pac_total,
    
    -- Party contributions (Line 11B, not pass-through)
    COALESCE(SUM(CASE 
      WHEN c.line_number = '11B'
        AND COALESCE(c.memo_code, '') != 'X'
        AND COALESCE(c.is_contribution, true) = true
        AND NOT (COALESCE(c.memo_text, '') ILIKE '%NOTE: ABOVE CONTRIBUTION%')
      THEN c.amount ELSE 0 
    END), 0)::numeric as party_total,
    
    -- Transfers (Line 12)
    COALESCE(SUM(CASE 
      WHEN c.line_number LIKE '12%'
        AND COALESCE(c.memo_code, '') != 'X'
      THEN c.amount ELSE 0 
    END), 0)::numeric as transfer_total,
    
    -- Loans (Line 13)
    COALESCE(SUM(CASE 
      WHEN c.line_number LIKE '13%'
        AND COALESCE(c.memo_code, '') != 'X'
      THEN c.amount ELSE 0 
    END), 0)::numeric as loan_total,
    
    -- Other receipts (Lines 14 + 15)
    COALESCE(SUM(CASE 
      WHEN c.line_number IN ('14', '15')
        AND COALESCE(c.memo_code, '') != 'X'
      THEN c.amount ELSE 0 
    END), 0)::numeric as other_total,
    
    -- Earmarked contributions
    COALESCE(SUM(CASE 
      WHEN c.is_earmarked = true
      THEN c.amount ELSE 0 
    END), 0)::numeric as earmarked_total,
    
    -- Memo code X contributions (for reference)
    COALESCE(SUM(CASE 
      WHEN c.memo_code = 'X'
      THEN c.amount ELSE 0 
    END), 0)::numeric as memo_x_total,
    
    -- Conduit organizations excluded from organization_total
    COALESCE(SUM(CASE 
      WHEN c.contributor_type IN ('Organization', 'Unknown') 
        AND c.line_number = '11AI'
        AND COALESCE(c.memo_code, '') != 'X'
        AND COALESCE(c.is_contribution, true) = true
        AND EXISTS (
          SELECT 1 FROM conduit_organizations co 
          WHERE co.is_active = true 
          AND UPPER(c.contributor_name) LIKE '%' || co.name || '%'
        )
      THEN c.amount ELSE 0 
    END), 0)::numeric as conduit_excluded,
    
    -- Pass-through contributions excluded (memo_text pattern detection)
    COALESCE(SUM(CASE 
      WHEN COALESCE(c.memo_text, '') ILIKE '%NOTE: ABOVE CONTRIBUTION%'
        AND COALESCE(c.memo_code, '') != 'X'
        AND c.line_number IN ('11AI', '11B', '11C')
      THEN c.amount ELSE 0 
    END), 0)::numeric as pass_through_excluded
    
  FROM contributions c
  WHERE c.candidate_id = p_candidate_id
    AND c.cycle = p_cycle;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_contribution_totals_by_committee(p_committee_id text, p_cycle text)
 RETURNS TABLE(individual_total numeric, organization_total numeric, pac_total numeric, party_total numeric, transfer_total numeric, loan_total numeric, other_total numeric, earmarked_total numeric, memo_x_total numeric, conduit_excluded numeric, pass_through_excluded numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    -- Individual contributions (Line 11AI, not memo_code='X', not pass-through)
    COALESCE(SUM(CASE 
      WHEN c.contributor_type = 'Individual' 
        AND c.line_number = '11AI'
        AND COALESCE(c.memo_code, '') != 'X'
        AND COALESCE(c.is_contribution, true) = true
        AND NOT (COALESCE(c.memo_text, '') ILIKE '%NOTE: ABOVE CONTRIBUTION%')
      THEN c.amount ELSE 0 
    END), 0)::numeric as individual_total,
    
    -- Organization contributions (Line 11AI, not memo_code='X', NOT a conduit, not pass-through, NOT PAC)
    COALESCE(SUM(CASE 
      WHEN c.contributor_type IN ('Organization', 'Unknown') 
        AND c.line_number = '11AI'
        AND COALESCE(c.memo_code, '') != 'X'
        AND COALESCE(c.is_contribution, true) = true
        AND NOT EXISTS (
          SELECT 1 FROM conduit_organizations co 
          WHERE co.is_active = true 
          AND UPPER(c.contributor_name) LIKE '%' || co.name || '%'
        )
        AND NOT (COALESCE(c.memo_text, '') ILIKE '%NOTE: ABOVE CONTRIBUTION%')
      THEN c.amount ELSE 0 
    END), 0)::numeric as organization_total,
    
    -- PAC contributions (Line 11AI or 11C, not pass-through)
    COALESCE(SUM(CASE 
      WHEN c.contributor_type = 'PAC'
        AND c.line_number IN ('11AI', '11C')
        AND COALESCE(c.memo_code, '') != 'X'
        AND COALESCE(c.is_contribution, true) = true
        AND NOT (COALESCE(c.memo_text, '') ILIKE '%NOTE: ABOVE CONTRIBUTION%')
      THEN c.amount ELSE 0 
    END), 0)::numeric as pac_total,
    
    -- Party contributions (Line 11B, not pass-through)
    COALESCE(SUM(CASE 
      WHEN c.line_number = '11B'
        AND COALESCE(c.memo_code, '') != 'X'
        AND COALESCE(c.is_contribution, true) = true
        AND NOT (COALESCE(c.memo_text, '') ILIKE '%NOTE: ABOVE CONTRIBUTION%')
      THEN c.amount ELSE 0 
    END), 0)::numeric as party_total,
    
    -- Transfers (Line 12)
    COALESCE(SUM(CASE 
      WHEN c.line_number LIKE '12%'
        AND COALESCE(c.memo_code, '') != 'X'
      THEN c.amount ELSE 0 
    END), 0)::numeric as transfer_total,
    
    -- Loans (Line 13)
    COALESCE(SUM(CASE 
      WHEN c.line_number LIKE '13%'
        AND COALESCE(c.memo_code, '') != 'X'
      THEN c.amount ELSE 0 
    END), 0)::numeric as loan_total,
    
    -- Other receipts (Lines 14 + 15)
    COALESCE(SUM(CASE 
      WHEN c.line_number IN ('14', '15')
        AND COALESCE(c.memo_code, '') != 'X'
      THEN c.amount ELSE 0 
    END), 0)::numeric as other_total,
    
    -- Earmarked contributions
    COALESCE(SUM(CASE 
      WHEN c.is_earmarked = true
      THEN c.amount ELSE 0 
    END), 0)::numeric as earmarked_total,
    
    -- Memo code X contributions (for reference)
    COALESCE(SUM(CASE 
      WHEN c.memo_code = 'X'
      THEN c.amount ELSE 0 
    END), 0)::numeric as memo_x_total,
    
    -- Conduit organizations excluded from organization_total
    COALESCE(SUM(CASE 
      WHEN c.contributor_type IN ('Organization', 'Unknown') 
        AND c.line_number = '11AI'
        AND COALESCE(c.memo_code, '') != 'X'
        AND COALESCE(c.is_contribution, true) = true
        AND EXISTS (
          SELECT 1 FROM conduit_organizations co 
          WHERE co.is_active = true 
          AND UPPER(c.contributor_name) LIKE '%' || co.name || '%'
        )
      THEN c.amount ELSE 0 
    END), 0)::numeric as conduit_excluded,
    
    -- Pass-through contributions excluded (memo_text pattern detection)
    COALESCE(SUM(CASE 
      WHEN COALESCE(c.memo_text, '') ILIKE '%NOTE: ABOVE CONTRIBUTION%'
        AND COALESCE(c.memo_code, '') != 'X'
        AND c.line_number IN ('11AI', '11B', '11C')
      THEN c.amount ELSE 0 
    END), 0)::numeric as pass_through_excluded
    
  FROM contributions c
  WHERE c.recipient_committee_id = p_committee_id
    AND c.cycle = p_cycle;
END;
$function$;