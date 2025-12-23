-- Add fec_committee_id column to candidates table
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS fec_committee_id text;

-- Clean up existing incorrect donor data (will be re-fetched with correct logic)
DELETE FROM donors;