-- Add category-level tracking columns to committee_finance_rollups
ALTER TABLE committee_finance_rollups
ADD COLUMN IF NOT EXISTS local_individual_itemized integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS local_pac_contributions integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS local_party_contributions integer DEFAULT 0;

-- Add category-level tracking columns to finance_reconciliation
ALTER TABLE finance_reconciliation
ADD COLUMN IF NOT EXISTS local_individual_itemized integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS local_pac_contributions integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS local_party_contributions integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS fec_pac_contributions integer,
ADD COLUMN IF NOT EXISTS fec_party_contributions integer,
ADD COLUMN IF NOT EXISTS individual_delta_amount integer,
ADD COLUMN IF NOT EXISTS individual_delta_pct numeric,
ADD COLUMN IF NOT EXISTS pac_delta_amount integer,
ADD COLUMN IF NOT EXISTS pac_delta_pct numeric;

-- Add comment explaining the column purposes
COMMENT ON COLUMN committee_finance_rollups.local_individual_itemized IS 'Sum of Line 11A/11AI - Individual itemized contributions';
COMMENT ON COLUMN committee_finance_rollups.local_pac_contributions IS 'Sum of Line 11C - PAC contributions';
COMMENT ON COLUMN committee_finance_rollups.local_party_contributions IS 'Sum of Line 11B - Party committee contributions';
COMMENT ON COLUMN finance_reconciliation.local_individual_itemized IS 'Local sum of Line 11A/11AI individual contributions';
COMMENT ON COLUMN finance_reconciliation.fec_pac_contributions IS 'FEC other_political_committee_contributions';
COMMENT ON COLUMN finance_reconciliation.fec_party_contributions IS 'FEC political_party_committee_contributions';