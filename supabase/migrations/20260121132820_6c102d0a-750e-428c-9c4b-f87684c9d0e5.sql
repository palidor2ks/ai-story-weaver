-- Fix: Include PAC contributions on Line 11AI in itemized calculation
-- FEC's individual_itemized_contributions = ALL Line 11AI (Individual + Org + PAC)
-- FEC's other_political_committee_contributions = ALL Line 11C

DROP FUNCTION IF EXISTS get_contribution_totals(text, text);
CREATE OR REPLACE FUNCTION get_contribution_totals(p_candidate_id text, p_cycle text)
RETURNS TABLE(
  individual_total numeric,
  organization_total numeric, 
  pac_total numeric,
  party_total numeric,
  other_total numeric,
  grand_total numeric
)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- Individual: Individuals on Line 11AI only
    COALESCE(SUM(CASE WHEN c.contributor_type = 'Individual' AND c.line_number = '11AI' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS individual_total,
    -- Organization: Organizations AND PACs on Line 11AI (to match FEC's individual_itemized_contributions)
    COALESCE(SUM(CASE WHEN c.contributor_type IN ('Organization', 'Unknown', 'PAC') AND c.line_number = '11AI' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS organization_total,
    -- PAC: ALL Line 11C contributions (to match FEC's other_political_committee_contributions)
    COALESCE(SUM(CASE WHEN c.line_number = '11C' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS pac_total,
    -- Party: Line 11B
    COALESCE(SUM(CASE WHEN c.line_number = '11B' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS party_total,
    -- Other: Everything else
    COALESCE(SUM(CASE WHEN c.line_number NOT IN ('11AI', '11B', '11C') AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS other_total,
    -- Grand total: All contribution lines
    COALESCE(SUM(CASE WHEN c.line_number IN ('11AI', '11B', '11C') AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS grand_total
  FROM public.contributions c
  JOIN public.candidate_committees com ON c.recipient_committee_id = com.fec_committee_id
  WHERE com.candidate_id = p_candidate_id
    AND c.cycle = p_cycle
    AND com.active = true
    AND com.designation IN ('P', 'A');
END;
$$;

DROP FUNCTION IF EXISTS get_contribution_totals_by_committee(text, text);
CREATE OR REPLACE FUNCTION get_contribution_totals_by_committee(p_committee_id text, p_cycle text)
RETURNS TABLE(
  individual_total numeric,
  organization_total numeric,
  pac_total numeric,
  party_total numeric,
  other_total numeric,
  grand_total numeric
)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- Individual: Individuals on Line 11AI only
    COALESCE(SUM(CASE WHEN c.contributor_type = 'Individual' AND c.line_number = '11AI' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS individual_total,
    -- Organization: Organizations AND PACs on Line 11AI (to match FEC's individual_itemized_contributions)
    COALESCE(SUM(CASE WHEN c.contributor_type IN ('Organization', 'Unknown', 'PAC') AND c.line_number = '11AI' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS organization_total,
    -- PAC: ALL Line 11C contributions (to match FEC's other_political_committee_contributions)
    COALESCE(SUM(CASE WHEN c.line_number = '11C' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS pac_total,
    -- Party: Line 11B
    COALESCE(SUM(CASE WHEN c.line_number = '11B' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS party_total,
    -- Other: Everything else
    COALESCE(SUM(CASE WHEN c.line_number NOT IN ('11AI', '11B', '11C') AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS other_total,
    -- Grand total: All contribution lines
    COALESCE(SUM(CASE WHEN c.line_number IN ('11AI', '11B', '11C') AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS grand_total
  FROM public.contributions c
  WHERE c.recipient_committee_id = p_committee_id
    AND c.cycle = p_cycle;
END;
$$;