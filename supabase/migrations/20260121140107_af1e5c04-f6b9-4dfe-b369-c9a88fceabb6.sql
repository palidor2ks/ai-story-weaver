-- Update RPC function: get_contribution_totals with separate columns for Line 12-15
DROP FUNCTION IF EXISTS get_contribution_totals(text, text);
CREATE OR REPLACE FUNCTION get_contribution_totals(p_candidate_id text, p_cycle text)
RETURNS TABLE(
  individual_total numeric,
  individual_gross numeric,
  organization_total numeric, 
  pac_total numeric,
  party_total numeric,
  transfer_total numeric,
  loan_total numeric,
  offset_total numeric,
  other_receipts_total numeric,
  earmarked_total numeric,
  memo_x_total numeric,
  conduit_excluded numeric,
  pass_through_excluded numeric,
  other_total numeric,
  grand_total numeric
)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- NET Individual (Line 11AI, excludes memo_code='X')
    COALESCE(SUM(CASE WHEN c.contributor_type = 'Individual' AND c.line_number = '11AI' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS individual_total,
    -- GROSS Individual (includes memo_code='X')
    COALESCE(SUM(CASE WHEN c.contributor_type = 'Individual' AND c.line_number = '11AI' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS individual_gross,
    -- Organization (Line 11AI non-Individual, excludes PAC)
    COALESCE(SUM(CASE WHEN c.contributor_type IN ('Organization', 'Unknown') AND c.contributor_type != 'PAC' AND c.line_number = '11AI' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS organization_total,
    -- PAC (Line 11C)
    COALESCE(SUM(CASE WHEN c.line_number = '11C' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS pac_total,
    -- Party (Line 11B)
    COALESCE(SUM(CASE WHEN c.line_number = '11B' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS party_total,
    -- Transfers (Line 12)
    COALESCE(SUM(CASE WHEN c.line_number = '12' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS transfer_total,
    -- Loans (Line 13 and variants)
    COALESCE(SUM(CASE WHEN c.line_number LIKE '13%' AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS loan_total,
    -- Offsets (Line 14)
    COALESCE(SUM(CASE WHEN c.line_number = '14' AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS offset_total,
    -- Other Receipts (Line 15 only)
    COALESCE(SUM(CASE WHEN c.line_number = '15' AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS other_receipts_total,
    -- Earmarked contributions (flagged)
    COALESCE(SUM(CASE WHEN c.is_earmarked = true AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS earmarked_total,
    -- Memo X total (pass-throughs)
    COALESCE(SUM(CASE WHEN c.memo_code = 'X' THEN c.amount ELSE 0 END), 0)::numeric AS memo_x_total,
    -- Conduit excluded (organizations with conduit_committee_id)
    COALESCE(SUM(CASE WHEN c.contributor_type IN ('Organization', 'Unknown') AND c.line_number = '11AI' AND c.conduit_committee_id IS NOT NULL AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS conduit_excluded,
    -- Pass-through excluded (detected via is_earmarked on 11C)
    COALESCE(SUM(CASE WHEN c.line_number = '11C' AND c.is_earmarked = true AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS pass_through_excluded,
    -- Legacy other_total (Line 12-15 combined, for backwards compatibility)
    COALESCE(SUM(CASE WHEN c.line_number NOT IN ('11AI', '11B', '11C') AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS other_total,
    -- Grand total (Line 11 only)
    COALESCE(SUM(CASE WHEN c.line_number IN ('11AI', '11B', '11C') AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS grand_total
  FROM public.contributions c
  JOIN public.candidate_committees com ON c.recipient_committee_id = com.fec_committee_id
  WHERE com.candidate_id = p_candidate_id
    AND c.cycle = p_cycle
    AND com.active = true
    AND com.designation IN ('P', 'A');
END;
$$;

-- Update RPC function: get_contribution_totals_by_committee with same columns
DROP FUNCTION IF EXISTS get_contribution_totals_by_committee(text, text);
CREATE OR REPLACE FUNCTION get_contribution_totals_by_committee(p_committee_id text, p_cycle text)
RETURNS TABLE(
  individual_total numeric,
  individual_gross numeric,
  organization_total numeric,
  pac_total numeric,
  party_total numeric,
  transfer_total numeric,
  loan_total numeric,
  offset_total numeric,
  other_receipts_total numeric,
  earmarked_total numeric,
  memo_x_total numeric,
  conduit_excluded numeric,
  pass_through_excluded numeric,
  other_total numeric,
  grand_total numeric
)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- NET Individual (Line 11AI, excludes memo_code='X')
    COALESCE(SUM(CASE WHEN c.contributor_type = 'Individual' AND c.line_number = '11AI' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS individual_total,
    -- GROSS Individual (includes memo_code='X')
    COALESCE(SUM(CASE WHEN c.contributor_type = 'Individual' AND c.line_number = '11AI' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS individual_gross,
    -- Organization (Line 11AI non-Individual, excludes PAC)
    COALESCE(SUM(CASE WHEN c.contributor_type IN ('Organization', 'Unknown') AND c.contributor_type != 'PAC' AND c.line_number = '11AI' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS organization_total,
    -- PAC (Line 11C)
    COALESCE(SUM(CASE WHEN c.line_number = '11C' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS pac_total,
    -- Party (Line 11B)
    COALESCE(SUM(CASE WHEN c.line_number = '11B' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS party_total,
    -- Transfers (Line 12)
    COALESCE(SUM(CASE WHEN c.line_number = '12' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS transfer_total,
    -- Loans (Line 13 and variants)
    COALESCE(SUM(CASE WHEN c.line_number LIKE '13%' AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS loan_total,
    -- Offsets (Line 14)
    COALESCE(SUM(CASE WHEN c.line_number = '14' AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS offset_total,
    -- Other Receipts (Line 15 only)
    COALESCE(SUM(CASE WHEN c.line_number = '15' AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS other_receipts_total,
    -- Earmarked contributions (flagged)
    COALESCE(SUM(CASE WHEN c.is_earmarked = true AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS earmarked_total,
    -- Memo X total (pass-throughs)
    COALESCE(SUM(CASE WHEN c.memo_code = 'X' THEN c.amount ELSE 0 END), 0)::numeric AS memo_x_total,
    -- Conduit excluded (organizations with conduit_committee_id)
    COALESCE(SUM(CASE WHEN c.contributor_type IN ('Organization', 'Unknown') AND c.line_number = '11AI' AND c.conduit_committee_id IS NOT NULL AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS conduit_excluded,
    -- Pass-through excluded (detected via is_earmarked on 11C)
    COALESCE(SUM(CASE WHEN c.line_number = '11C' AND c.is_earmarked = true AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS pass_through_excluded,
    -- Legacy other_total (Line 12-15 combined, for backwards compatibility)
    COALESCE(SUM(CASE WHEN c.line_number NOT IN ('11AI', '11B', '11C') AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS other_total,
    -- Grand total (Line 11 only)
    COALESCE(SUM(CASE WHEN c.line_number IN ('11AI', '11B', '11C') AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS grand_total
  FROM public.contributions c
  WHERE c.recipient_committee_id = p_committee_id
    AND c.cycle = p_cycle;
END;
$$;