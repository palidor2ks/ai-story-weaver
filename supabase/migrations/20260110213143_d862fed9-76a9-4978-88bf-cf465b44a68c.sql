-- Add columns for accurate bill status tracking from action history
ALTER TABLE bills ADD COLUMN IF NOT EXISTS max_action_code integer;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS passed_house boolean DEFAULT false;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS passed_senate boolean DEFAULT false;

-- Create an index on max_action_code to quickly find bills needing enrichment
CREATE INDEX IF NOT EXISTS idx_bills_max_action_code ON bills(max_action_code) WHERE max_action_code IS NULL;