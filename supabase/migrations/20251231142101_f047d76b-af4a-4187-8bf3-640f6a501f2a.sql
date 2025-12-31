-- Add local_organization column to track organization contributions (Line 11A with contributor_type=Organization)
ALTER TABLE public.finance_reconciliation ADD COLUMN IF NOT EXISTS local_organization bigint;

-- Add local_organization to committee_finance_rollups as well
ALTER TABLE public.committee_finance_rollups ADD COLUMN IF NOT EXISTS local_organization bigint;