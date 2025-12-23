-- Extend donors table with additional tracking columns for accuracy and transparency
ALTER TABLE public.donors 
ADD COLUMN IF NOT EXISTS recipient_committee_id text,
ADD COLUMN IF NOT EXISTS recipient_committee_name text,
ADD COLUMN IF NOT EXISTS first_receipt_date date,
ADD COLUMN IF NOT EXISTS last_receipt_date date,
ADD COLUMN IF NOT EXISTS transaction_count integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS contributor_city text,
ADD COLUMN IF NOT EXISTS contributor_state text,
ADD COLUMN IF NOT EXISTS contributor_zip text,
ADD COLUMN IF NOT EXISTS employer text,
ADD COLUMN IF NOT EXISTS occupation text,
ADD COLUMN IF NOT EXISTS line_number text,
ADD COLUMN IF NOT EXISTS is_contribution boolean DEFAULT true;

-- Add index for recipient committee lookups
CREATE INDEX IF NOT EXISTS idx_donors_recipient_committee ON public.donors(recipient_committee_id);

-- Add index for filtering contributions vs other receipts
CREATE INDEX IF NOT EXISTS idx_donors_is_contribution ON public.donors(is_contribution);

-- Comment for clarity
COMMENT ON COLUMN public.donors.is_contribution IS 'True for actual contributions (line 11*/12*), false for other receipts (line 15)';
COMMENT ON COLUMN public.donors.recipient_committee_id IS 'FEC committee ID that received the contribution';
COMMENT ON COLUMN public.donors.line_number IS 'FEC Schedule A line number (11ai, 11b, 15, etc.)';