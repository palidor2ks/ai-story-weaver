-- Reclassify FEC Schedule A Line 14 rows (Refunds/Rebates/Returns of Federal Contributions)
-- as vendor refunds, not real contributions. These are money returned to the committee
-- by vendors (e.g. AUTHENTIC CAMPAIGNS) and should not appear in donor totals.

UPDATE public.donors
SET is_contribution = false,
    is_vendor_refund = true,
    amount = 0
WHERE line_number LIKE '14%'
  AND (is_contribution = true OR is_vendor_refund = false);

UPDATE public.contributions
SET is_contribution = false
WHERE line_number LIKE '14%'
  AND is_contribution = true;

-- Refresh finance_reconciliation for affected candidates so local_itemized drops
-- the reclassified amounts.
WITH affected AS (
  SELECT DISTINCT candidate_id, cycle
  FROM public.donors
  WHERE line_number LIKE '14%'
    AND candidate_id IS NOT NULL
),
recomputed AS (
  SELECT
    d.candidate_id,
    d.cycle,
    COALESCE(SUM(CASE WHEN d.is_transfer THEN d.amount ELSE 0 END), 0) AS local_transfers,
    COALESCE(SUM(CASE WHEN d.is_contribution = true AND COALESCE(d.is_conduit_org,false) = false AND COALESCE(d.is_vendor_refund,false) = false AND COALESCE(d.is_transfer,false) = false THEN d.amount ELSE 0 END), 0) AS local_itemized_net
  FROM public.donors d
  JOIN affected a ON a.candidate_id = d.candidate_id AND a.cycle = d.cycle
  GROUP BY d.candidate_id, d.cycle
)
UPDATE public.finance_reconciliation fr
SET local_itemized = r.local_itemized_net,
    local_itemized_net = r.local_itemized_net,
    local_transfers = r.local_transfers,
    delta_amount = r.local_itemized_net - COALESCE(fr.fec_itemized, 0),
    delta_pct = CASE WHEN COALESCE(fr.fec_itemized, 0) > 0
                     THEN ROUND(((r.local_itemized_net - fr.fec_itemized) / fr.fec_itemized * 100)::numeric, 2)
                     ELSE 0 END,
    status = CASE
      WHEN COALESCE(fr.fec_itemized, 0) = 0 THEN fr.status
      WHEN ABS((r.local_itemized_net - fr.fec_itemized) / fr.fec_itemized * 100) > 10 THEN 'error'
      WHEN ABS((r.local_itemized_net - fr.fec_itemized) / fr.fec_itemized * 100) > 5 THEN 'warning'
      ELSE 'ok'
    END,
    checked_at = now(),
    notes = COALESCE(fr.notes, '') || ' | Line 14 vendor-refund cleanup ' || now()::text
FROM recomputed r
WHERE fr.candidate_id = r.candidate_id AND fr.cycle = r.cycle;