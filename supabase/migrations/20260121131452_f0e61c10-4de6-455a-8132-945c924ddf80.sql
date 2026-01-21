-- Fix: Drop all overloads of get_contribution_totals_by_committee

DROP FUNCTION IF EXISTS public.get_contribution_totals_by_committee(uuid, text);
DROP FUNCTION IF EXISTS public.get_contribution_totals_by_committee(text, text);

CREATE FUNCTION public.get_contribution_totals_by_committee(p_committee_id text, p_cycle text)
RETURNS TABLE(
  individual_total numeric,
  organization_total numeric,
  pac_total numeric,
  party_total numeric,
  other_total numeric,
  grand_total numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(
      CASE 
        WHEN c.contributor_type = 'Individual' 
          AND c.line_number = '11AI'
          AND COALESCE(c.memo_code, '') != 'X'
          AND COALESCE(c.is_contribution, true) = true
        THEN c.amount ELSE 0 
      END
    ), 0) AS individual_total,
    COALESCE(SUM(
      CASE 
        WHEN c.contributor_type IN ('Organization', 'Unknown')
          AND c.contributor_type != 'PAC'
          AND c.line_number IN ('11AI', '11C')
          AND COALESCE(c.memo_code, '') != 'X'
          AND COALESCE(c.is_contribution, true) = true
        THEN c.amount ELSE 0 
      END
    ), 0) AS organization_total,
    COALESCE(SUM(
      CASE 
        WHEN c.contributor_type = 'PAC'
          AND c.line_number IN ('11AI', '11C')
          AND COALESCE(c.memo_code, '') != 'X'
          AND COALESCE(c.is_contribution, true) = true
        THEN c.amount ELSE 0 
      END
    ), 0) AS pac_total,
    COALESCE(SUM(
      CASE 
        WHEN c.line_number = '11B'
          AND COALESCE(c.memo_code, '') != 'X'
          AND COALESCE(c.is_contribution, true) = true
        THEN c.amount ELSE 0 
      END
    ), 0) AS party_total,
    COALESCE(SUM(
      CASE 
        WHEN c.line_number NOT IN ('11AI', '11B', '11C')
          AND COALESCE(c.memo_code, '') != 'X'
          AND COALESCE(c.is_contribution, true) = true
        THEN c.amount ELSE 0 
      END
    ), 0) AS other_total,
    COALESCE(SUM(
      CASE 
        WHEN c.line_number IN ('11AI', '11B', '11C')
          AND COALESCE(c.memo_code, '') != 'X'
          AND COALESCE(c.is_contribution, true) = true
        THEN c.amount ELSE 0 
      END
    ), 0) AS grand_total
  FROM public.contributions c
  WHERE c.recipient_committee_id = p_committee_id
    AND c.cycle = p_cycle;
END;
$$;