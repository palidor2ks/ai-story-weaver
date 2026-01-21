-- Fix: Use correct column name 'active' instead of 'is_active'

DROP FUNCTION IF EXISTS public.get_contribution_totals(text, text);

CREATE FUNCTION public.get_contribution_totals(p_candidate_id text, p_cycle text)
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
    COALESCE(SUM(CASE WHEN c.contributor_type = 'Individual' AND c.line_number = '11AI' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0) AS individual_total,
    COALESCE(SUM(CASE WHEN c.contributor_type IN ('Organization', 'Unknown') AND c.contributor_type != 'PAC' AND c.line_number IN ('11AI', '11C') AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0) AS organization_total,
    COALESCE(SUM(CASE WHEN c.contributor_type = 'PAC' AND c.line_number IN ('11AI', '11C') AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0) AS pac_total,
    COALESCE(SUM(CASE WHEN c.line_number = '11B' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0) AS party_total,
    COALESCE(SUM(CASE WHEN c.line_number NOT IN ('11AI', '11B', '11C') AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0) AS other_total,
    COALESCE(SUM(CASE WHEN c.line_number IN ('11AI', '11B', '11C') AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0) AS grand_total
  FROM public.contributions c
  JOIN public.candidate_committees com ON c.recipient_committee_id = com.fec_committee_id
  WHERE com.candidate_id = p_candidate_id
    AND c.cycle = p_cycle
    AND com.active = true
    AND com.designation IN ('P', 'A');
END;
$$;