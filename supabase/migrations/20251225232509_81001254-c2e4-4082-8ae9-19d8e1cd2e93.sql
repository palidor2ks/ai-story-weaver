-- Backfill committee_finance_rollups with category-level totals from existing contributions
UPDATE committee_finance_rollups cfr
SET 
  local_individual_itemized = COALESCE(sub.individual_total, 0),
  local_pac_contributions = COALESCE(sub.pac_total, 0),
  local_party_contributions = COALESCE(sub.party_total, 0),
  updated_at = NOW()
FROM (
  SELECT 
    candidate_id,
    recipient_committee_id,
    cycle,
    SUM(CASE WHEN line_number IN ('11A', '11AI') THEN amount ELSE 0 END) as individual_total,
    SUM(CASE WHEN line_number = '11C' THEN amount ELSE 0 END) as pac_total,
    SUM(CASE WHEN line_number = '11B' THEN amount ELSE 0 END) as party_total
  FROM contributions
  WHERE is_contribution = true
  GROUP BY candidate_id, recipient_committee_id, cycle
) sub
WHERE cfr.candidate_id = sub.candidate_id
  AND cfr.committee_id = sub.recipient_committee_id
  AND cfr.cycle = sub.cycle;

-- Backfill finance_reconciliation with category-level totals
UPDATE finance_reconciliation fr
SET 
  local_individual_itemized = COALESCE(sub.individual_total, 0),
  local_pac_contributions = COALESCE(sub.pac_total, 0),
  local_party_contributions = COALESCE(sub.party_total, 0),
  individual_delta_amount = COALESCE(sub.individual_total, 0) - COALESCE(fr.fec_itemized, 0),
  individual_delta_pct = CASE 
    WHEN COALESCE(fr.fec_itemized, 0) > 0 
    THEN ROUND(((COALESCE(sub.individual_total, 0) - COALESCE(fr.fec_itemized, 0))::numeric / fr.fec_itemized) * 100, 2)
    ELSE NULL 
  END,
  updated_at = NOW()
FROM (
  SELECT 
    candidate_id,
    cycle,
    SUM(CASE WHEN line_number IN ('11A', '11AI') THEN amount ELSE 0 END) as individual_total,
    SUM(CASE WHEN line_number = '11C' THEN amount ELSE 0 END) as pac_total,
    SUM(CASE WHEN line_number = '11B' THEN amount ELSE 0 END) as party_total
  FROM contributions
  WHERE is_contribution = true
  GROUP BY candidate_id, cycle
) sub
WHERE fr.candidate_id = sub.candidate_id
  AND fr.cycle = sub.cycle;