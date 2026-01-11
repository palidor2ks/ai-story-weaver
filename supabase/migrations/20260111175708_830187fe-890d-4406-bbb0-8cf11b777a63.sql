-- Drop the problematic B-tree index on summary column
-- This index fails when summary text exceeds 8191 bytes (B-tree limit)
-- One bill in the Excel import had a ~13KB summary, causing insert failure
DROP INDEX IF EXISTS bills_summary_idx;

-- Add a comment explaining the decision
COMMENT ON COLUMN bills.summary IS 'Bill summary text - not indexed due to B-tree size constraints (8KB limit)';