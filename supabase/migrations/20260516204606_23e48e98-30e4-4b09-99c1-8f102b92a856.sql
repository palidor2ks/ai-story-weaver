-- Seed finance_reconciliation for Ashley Moody (M001244), cycle 2026,
-- aggregating from the freshly imported contributions.
WITH t AS (
  SELECT * FROM public.get_contribution_totals('M001244', '2026')
)
INSERT INTO public.finance_reconciliation (
  candidate_id, cycle,
  local_itemized, local_itemized_net, local_gross_individual,
  local_individual_itemized, local_pac_contributions, local_party_contributions,
  local_organization, local_transfers, local_loans,
  local_other_receipts, local_earmarked,
  memo_x_amount, pass_through_excluded,
  fec_total_receipts, fec_itemized, fec_unitemized,
  fec_pac_contributions, fec_party_contributions, fec_candidate_contribution,
  fec_transfers, fec_loans, fec_offsets_to_operating_expenditures, fec_other_receipts,
  delta_amount, delta_pct,
  individual_delta_amount, individual_delta_pct,
  pac_delta_amount, pac_delta_pct,
  status, checked_at, created_at, updated_at
)
SELECT
  'M001244', '2026',
  t.grand_total, t.individual_total + t.organization_total + t.pac_total + t.party_total,
  t.individual_gross,
  t.individual_total, t.pac_total, t.party_total,
  t.organization_total, t.transfer_total, t.loan_total,
  t.other_receipts_total, t.earmarked_total,
  t.memo_x_total, t.pass_through_excluded,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0,
  'pending_fec', NOW(), NOW(), NOW()
FROM t
ON CONFLICT (candidate_id, cycle) DO UPDATE SET
  local_itemized = EXCLUDED.local_itemized,
  local_itemized_net = EXCLUDED.local_itemized_net,
  local_gross_individual = EXCLUDED.local_gross_individual,
  local_individual_itemized = EXCLUDED.local_individual_itemized,
  local_pac_contributions = EXCLUDED.local_pac_contributions,
  local_party_contributions = EXCLUDED.local_party_contributions,
  local_organization = EXCLUDED.local_organization,
  local_transfers = EXCLUDED.local_transfers,
  local_loans = EXCLUDED.local_loans,
  local_other_receipts = EXCLUDED.local_other_receipts,
  local_earmarked = EXCLUDED.local_earmarked,
  memo_x_amount = EXCLUDED.memo_x_amount,
  pass_through_excluded = EXCLUDED.pass_through_excluded,
  status = 'pending_fec',
  checked_at = NOW(),
  updated_at = NOW();

-- Update committee local_itemized_total for Moody for Florida
UPDATE public.candidate_committees cc
SET local_itemized_total = sub.tot,
    updated_at = NOW()
FROM (
  SELECT recipient_committee_id, SUM(amount) AS tot
  FROM public.contributions
  WHERE candidate_id = 'M001244' AND cycle = '2026'
  GROUP BY recipient_committee_id
) sub
WHERE cc.candidate_id = 'M001244'
  AND cc.fec_committee_id = sub.recipient_committee_id;