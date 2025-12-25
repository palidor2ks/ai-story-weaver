-- Add conduit fields to contributions table
ALTER TABLE contributions ADD COLUMN IF NOT EXISTS conduit_committee_name TEXT;
-- Note: conduit_committee_id, conduit_city, conduit_state, conduit_zip already exist in schema

-- Add conduit fields to donors table
ALTER TABLE donors ADD COLUMN IF NOT EXISTS is_conduit_org BOOLEAN DEFAULT false;
ALTER TABLE donors ADD COLUMN IF NOT EXISTS conduit_name TEXT;
ALTER TABLE donors ADD COLUMN IF NOT EXISTS conduit_committee_id TEXT;