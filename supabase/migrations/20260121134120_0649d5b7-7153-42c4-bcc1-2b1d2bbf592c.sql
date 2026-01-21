-- Add total receipts delta columns to finance_reconciliation
-- These compare local total receipts vs FEC total receipts (for UI display)
-- The existing delta_amount/delta_pct compare itemized contributions only (for data integrity)

ALTER TABLE finance_reconciliation
ADD COLUMN IF NOT EXISTS total_receipts_delta_amount integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS total_receipts_delta_pct numeric DEFAULT NULL;

COMMENT ON COLUMN finance_reconciliation.total_receipts_delta_amount IS 'Delta between local total receipts and FEC total receipts (for UI display)';
COMMENT ON COLUMN finance_reconciliation.total_receipts_delta_pct IS 'Percentage delta between local total receipts and FEC total receipts';