-- Add local_itemized_net column to finance_reconciliation table
-- This column stores itemized contributions EXCLUDING earmark pass-throughs (SEE BELOW entries)
-- which gives a comparable number to FEC's itemized total

ALTER TABLE public.finance_reconciliation 
ADD COLUMN IF NOT EXISTS local_itemized_net integer DEFAULT 0;

-- Add comment explaining the column
COMMENT ON COLUMN public.finance_reconciliation.local_itemized_net IS 
  'Net itemized contributions excluding earmark pass-throughs (SEE BELOW). Comparable to FEC itemized.';