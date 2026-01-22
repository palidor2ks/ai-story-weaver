-- Fix conduit aggregate records: Organization/PAC records on Line 11AI with conduit 
-- pass-through memo_text are aggregate records, not countable contributions.
-- Mark them with memo_code='X' to exclude from reconciliation totals.

UPDATE contributions
SET memo_code = 'X'
WHERE line_number = '11AI'
  AND contributor_type IN ('Organization', 'Unknown')
  AND memo_text ILIKE '%EARMARKED THROUGH CONDUIT%'
  AND (memo_code IS NULL OR memo_code = '');