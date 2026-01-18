-- Add columns for Line 14 offsets tracking in finance_reconciliation
ALTER TABLE public.finance_reconciliation
ADD COLUMN IF NOT EXISTS local_other_receipts bigint,
ADD COLUMN IF NOT EXISTS fec_offsets_to_operating_expenditures bigint;

-- Add comment for clarity
COMMENT ON COLUMN public.finance_reconciliation.local_other_receipts IS 'Local sum of Line 14 + Line 15 (net of memo X) - offsets and other receipts';
COMMENT ON COLUMN public.finance_reconciliation.fec_offsets_to_operating_expenditures IS 'FEC offsets_to_operating_expenditures (Line 14)';