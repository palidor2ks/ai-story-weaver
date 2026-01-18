-- Add FEC.gov-visible transaction ID column
ALTER TABLE contributions 
ADD COLUMN IF NOT EXISTS fec_committee_transaction_id TEXT;

COMMENT ON COLUMN contributions.fec_committee_transaction_id IS 
  'Committee-assigned transaction ID visible on FEC.gov (different from sub_id stored in fec_transaction_id)';