-- Add columns for loans, transfers, candidate contributions, and other receipts
-- These fields complete the FEC breakdown so all rows sum exactly to FEC Total Receipts

ALTER TABLE finance_reconciliation 
ADD COLUMN IF NOT EXISTS fec_loans integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS fec_transfers integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS fec_candidate_contribution integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS fec_other_receipts integer DEFAULT 0;