-- Cleanup: Mark external committees (J/U/B/D) as inactive for all candidates
UPDATE candidate_committees 
SET active = false, updated_at = now()
WHERE designation IN ('J', 'U', 'B', 'D') 
  AND active = true;

-- Delete committee_finance_rollups for external committees
-- These should not contribute to candidate totals
DELETE FROM committee_finance_rollups
WHERE committee_id IN (
  SELECT fec_committee_id 
  FROM candidate_committees 
  WHERE designation IN ('J', 'U', 'B', 'D')
);

-- Delete finance_reconciliation records that were inflated by external committees
-- They will be recalculated on next sync with correct P/A only totals
DELETE FROM finance_reconciliation
WHERE candidate_id IN (
  SELECT DISTINCT candidate_id 
  FROM candidate_committees 
  WHERE designation IN ('J', 'U', 'B', 'D')
);