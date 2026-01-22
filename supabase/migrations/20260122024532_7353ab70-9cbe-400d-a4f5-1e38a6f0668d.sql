-- Fix Line 12 attribution records: Individual names on Line 12 are informational records
-- showing WHO contributed through a JFC, not actual transfers. They should have memo_code='X'
-- to be excluded from reconciliation totals (matching FEC's official totals).

UPDATE contributions
SET memo_code = 'X'
WHERE line_number = '12'
  AND contributor_type = 'Individual'
  AND (memo_code IS NULL OR memo_code = '');