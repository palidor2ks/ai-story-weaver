-- Reset get_contribution_totals signatures so future CREATE OR REPLACE migrations
-- (e.g. PR #141's branch) can change the OUT columns without hitting
-- "cannot change return type of existing function". The live DB has a 15-column
-- signature; older migration history defines an 11-column version. Drop both,
-- then re-create the current 15-column version verbatim from the live DB.

DROP FUNCTION IF EXISTS public.get_contribution_totals(text, text);
DROP FUNCTION IF EXISTS public.get_contribution_totals_by_committee(text, text);

CREATE OR REPLACE FUNCTION public.get_contribution_totals(p_candidate_id text, p_cycle text)
 RETURNS TABLE(individual_total numeric, individual_gross numeric, organization_total numeric, pac_total numeric, party_total numeric, transfer_total numeric, loan_total numeric, offset_total numeric, other_receipts_total numeric, earmarked_total numeric, memo_x_total numeric, conduit_excluded numeric, pass_through_excluded numeric, other_total numeric, grand_total numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN c.contributor_type = 'Individual' AND c.line_number = '11AI' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS individual_total,
    COALESCE(SUM(CASE WHEN c.contributor_type = 'Individual' AND c.line_number = '11AI' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS individual_gross,
    COALESCE(SUM(CASE WHEN c.contributor_type IN ('Organization', 'Unknown') AND c.contributor_type != 'PAC' AND c.line_number = '11AI' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS organization_total,
    COALESCE(SUM(CASE WHEN c.line_number = '11C' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS pac_total,
    COALESCE(SUM(CASE WHEN c.line_number = '11B' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS party_total,
    COALESCE(SUM(CASE WHEN c.line_number = '12' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS transfer_total,
    COALESCE(SUM(CASE WHEN c.line_number LIKE '13%' AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS loan_total,
    COALESCE(SUM(CASE WHEN c.line_number = '14' AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS offset_total,
    COALESCE(SUM(CASE WHEN c.line_number = '15' AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS other_receipts_total,
    COALESCE(SUM(CASE WHEN c.is_earmarked = true AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS earmarked_total,
    COALESCE(SUM(CASE WHEN c.memo_code = 'X' THEN c.amount ELSE 0 END), 0)::numeric AS memo_x_total,
    COALESCE(SUM(CASE WHEN c.contributor_type IN ('Organization', 'Unknown') AND c.line_number = '11AI' AND c.conduit_committee_id IS NOT NULL AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS conduit_excluded,
    COALESCE(SUM(CASE WHEN c.line_number = '11C' AND c.is_earmarked = true AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS pass_through_excluded,
    COALESCE(SUM(CASE WHEN c.line_number NOT IN ('11AI', '11B', '11C') AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS other_total,
    COALESCE(SUM(CASE WHEN c.line_number IN ('11AI', '11B', '11C') AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS grand_total
  FROM public.contributions c
  JOIN public.candidate_committees com ON c.recipient_committee_id = com.fec_committee_id
  WHERE com.candidate_id = p_candidate_id
    AND c.cycle = p_cycle
    AND com.active = true
    AND com.designation IN ('P', 'A');
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_contribution_totals_by_committee(p_committee_id text, p_cycle text)
 RETURNS TABLE(individual_total numeric, individual_gross numeric, organization_total numeric, pac_total numeric, party_total numeric, transfer_total numeric, loan_total numeric, offset_total numeric, other_receipts_total numeric, earmarked_total numeric, memo_x_total numeric, conduit_excluded numeric, pass_through_excluded numeric, other_total numeric, grand_total numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN c.contributor_type = 'Individual' AND c.line_number = '11AI' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS individual_total,
    COALESCE(SUM(CASE WHEN c.contributor_type = 'Individual' AND c.line_number = '11AI' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS individual_gross,
    COALESCE(SUM(CASE WHEN c.contributor_type IN ('Organization', 'Unknown') AND c.contributor_type != 'PAC' AND c.line_number = '11AI' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS organization_total,
    COALESCE(SUM(CASE WHEN c.line_number = '11C' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS pac_total,
    COALESCE(SUM(CASE WHEN c.line_number = '11B' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS party_total,
    COALESCE(SUM(CASE WHEN c.line_number = '12' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS transfer_total,
    COALESCE(SUM(CASE WHEN c.line_number LIKE '13%' AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS loan_total,
    COALESCE(SUM(CASE WHEN c.line_number = '14' AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS offset_total,
    COALESCE(SUM(CASE WHEN c.line_number = '15' AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS other_receipts_total,
    COALESCE(SUM(CASE WHEN c.is_earmarked = true AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS earmarked_total,
    COALESCE(SUM(CASE WHEN c.memo_code = 'X' THEN c.amount ELSE 0 END), 0)::numeric AS memo_x_total,
    COALESCE(SUM(CASE WHEN c.contributor_type IN ('Organization', 'Unknown') AND c.line_number = '11AI' AND c.conduit_committee_id IS NOT NULL AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS conduit_excluded,
    COALESCE(SUM(CASE WHEN c.line_number = '11C' AND c.is_earmarked = true AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS pass_through_excluded,
    COALESCE(SUM(CASE WHEN c.line_number NOT IN ('11AI', '11B', '11C') AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS other_total,
    COALESCE(SUM(CASE WHEN c.line_number IN ('11AI', '11B', '11C') AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS grand_total
  FROM public.contributions c
  WHERE c.recipient_committee_id = p_committee_id
    AND c.cycle = p_cycle;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_contribution_totals(text, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_contribution_totals_by_committee(text, text) TO authenticated, anon, service_role;