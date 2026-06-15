-- FEC reconciliation Finding B fix: stop `other_total` from double-counting transfers.
--
-- Both get_contribution_totals() and get_contribution_totals_by_committee() defined
-- `other_total` as the catch-all `line_number NOT IN ('11AI','11B','11C')`. In practice the
-- only non-contribution line stored with is_contribution=true is Line 12 (transfers from
-- authorized committees / JFC), so `other_total` silently equalled `transfer_total` for every
-- committee. The reconciliation total formula
-- (nightly-finance-reconciliation: localTotal = localItemized + effectiveTransfers +
--  effectiveLoans + effectiveOther) then counted that Line-12 money twice — once as
-- effectiveTransfers and again inside effectiveOther = max(localOther, fecOther+fecOffsets) —
-- inflating total_receipts_delta (e.g. Bill Cassidy 2026: $2.27M JFC transfers booked in BOTH
-- local_transfers and local_other_receipts). Scope at write time: 848 finance_reconciliation
-- rows carried ~$181.6M of such "other" that is really transfers/stale.
--
-- "Other receipts" should mean exactly what FEC's side of the comparison means
-- (fecOtherReceipts + fecOffsetsToOperatingExpenditures): Line 14 (offsets to operating
-- expenditures) + Line 15 (other receipts). That is identical to this function's own
-- offset_total + other_receipts_total columns, so other_total is redefined to match them
-- (and, like those two columns, it no longer filters on is_contribution — offsets/other
-- receipts are receipts, not contributions). Transfers (12) and loans (13) stay in their own
-- categories and are added once each by the total formula.
--
-- Read-path only: these functions compute reconciliation category totals; they do not mutate
-- donor-facing data. Reconciliation rows refresh to the corrected values as the
-- drain-fec-finance / nightly-finance-reconciliation pipeline reprocesses each candidate.

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
    COALESCE(SUM(CASE WHEN c.contributor_type IN ('Organization', 'Unknown') AND c.line_number = '11AI' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true
                       AND NOT (
                         upper(c.contributor_name) LIKE '%ACTBLUE%'
                         OR upper(c.contributor_name) LIKE '%WINRED%'
                         OR upper(c.contributor_name) LIKE '%DEMOCRACY ENGINE%'
                         OR c.conduit_committee_id IS NOT NULL
                         OR upper(COALESCE(c.memo_text, '')) LIKE '%SEE BELOW%'
                         OR upper(COALESCE(c.memo_text, '')) LIKE '%EARMARKED CONTRIBUTION:%'
                       )
                  THEN c.amount ELSE 0 END), 0)::numeric AS organization_total,
    COALESCE(SUM(CASE WHEN c.line_number = '11C' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS pac_total,
    COALESCE(SUM(CASE WHEN c.line_number = '11B' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS party_total,
    COALESCE(SUM(CASE WHEN c.line_number = '12' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS transfer_total,
    COALESCE(SUM(CASE WHEN c.line_number LIKE '13%' AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS loan_total,
    COALESCE(SUM(CASE WHEN c.line_number = '14' AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS offset_total,
    COALESCE(SUM(CASE WHEN c.line_number = '15' AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS other_receipts_total,
    COALESCE(SUM(CASE WHEN c.is_earmarked = true AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS earmarked_total,
    COALESCE(SUM(CASE WHEN c.memo_code = 'X' THEN c.amount ELSE 0 END), 0)::numeric AS memo_x_total,
    COALESCE(SUM(CASE WHEN c.contributor_type IN ('Organization', 'Unknown') AND c.line_number = '11AI' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true
                       AND (
                         upper(c.contributor_name) LIKE '%ACTBLUE%'
                         OR upper(c.contributor_name) LIKE '%WINRED%'
                         OR upper(c.contributor_name) LIKE '%DEMOCRACY ENGINE%'
                         OR c.conduit_committee_id IS NOT NULL
                         OR upper(COALESCE(c.memo_text, '')) LIKE '%SEE BELOW%'
                         OR upper(COALESCE(c.memo_text, '')) LIKE '%EARMARKED CONTRIBUTION:%'
                       )
                  THEN c.amount ELSE 0 END), 0)::numeric AS conduit_excluded,
    COALESCE(SUM(CASE WHEN c.line_number = '11C' AND c.is_earmarked = true AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS pass_through_excluded,
    -- FIX (Finding B): true "other receipts" = Line 14 (offsets) + Line 15 (other receipts),
    -- matching offset_total + other_receipts_total and FEC's fecOtherReceipts + fecOffsets.
    -- Was: line_number NOT IN ('11AI','11B','11C'), which swept in Line 12 transfers (double-count).
    COALESCE(SUM(CASE WHEN c.line_number IN ('14', '15') AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS other_total,
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
    COALESCE(SUM(CASE WHEN c.contributor_type IN ('Organization', 'Unknown') AND c.line_number = '11AI' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true
                       AND NOT (
                         upper(c.contributor_name) LIKE '%ACTBLUE%'
                         OR upper(c.contributor_name) LIKE '%WINRED%'
                         OR upper(c.contributor_name) LIKE '%DEMOCRACY ENGINE%'
                         OR c.conduit_committee_id IS NOT NULL
                         OR upper(COALESCE(c.memo_text, '')) LIKE '%SEE BELOW%'
                         OR upper(COALESCE(c.memo_text, '')) LIKE '%EARMARKED CONTRIBUTION:%'
                       )
                  THEN c.amount ELSE 0 END), 0)::numeric AS organization_total,
    COALESCE(SUM(CASE WHEN c.line_number = '11C' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS pac_total,
    COALESCE(SUM(CASE WHEN c.line_number = '11B' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS party_total,
    COALESCE(SUM(CASE WHEN c.line_number = '12' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS transfer_total,
    COALESCE(SUM(CASE WHEN c.line_number LIKE '13%' AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS loan_total,
    COALESCE(SUM(CASE WHEN c.line_number = '14' AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS offset_total,
    COALESCE(SUM(CASE WHEN c.line_number = '15' AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS other_receipts_total,
    COALESCE(SUM(CASE WHEN c.is_earmarked = true AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS earmarked_total,
    COALESCE(SUM(CASE WHEN c.memo_code = 'X' THEN c.amount ELSE 0 END), 0)::numeric AS memo_x_total,
    COALESCE(SUM(CASE WHEN c.contributor_type IN ('Organization', 'Unknown') AND c.line_number = '11AI' AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true
                       AND (
                         upper(c.contributor_name) LIKE '%ACTBLUE%'
                         OR upper(c.contributor_name) LIKE '%WINRED%'
                         OR upper(c.contributor_name) LIKE '%DEMOCRACY ENGINE%'
                         OR c.conduit_committee_id IS NOT NULL
                         OR upper(COALESCE(c.memo_text, '')) LIKE '%SEE BELOW%'
                         OR upper(COALESCE(c.memo_text, '')) LIKE '%EARMARKED CONTRIBUTION:%'
                       )
                  THEN c.amount ELSE 0 END), 0)::numeric AS conduit_excluded,
    COALESCE(SUM(CASE WHEN c.line_number = '11C' AND c.is_earmarked = true AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS pass_through_excluded,
    -- FIX (Finding B): true "other receipts" = Line 14 (offsets) + Line 15 (other receipts).
    -- Was: line_number NOT IN ('11AI','11B','11C'), which swept in Line 12 transfers (double-count).
    COALESCE(SUM(CASE WHEN c.line_number IN ('14', '15') AND COALESCE(c.memo_code, '') != 'X' THEN c.amount ELSE 0 END), 0)::numeric AS other_total,
    COALESCE(SUM(CASE WHEN c.line_number IN ('11AI', '11B', '11C') AND COALESCE(c.memo_code, '') != 'X' AND COALESCE(c.is_contribution, true) = true THEN c.amount ELSE 0 END), 0)::numeric AS grand_total
  FROM public.contributions c
  WHERE c.recipient_committee_id = p_committee_id
    AND c.cycle = p_cycle;
END;
$function$;
