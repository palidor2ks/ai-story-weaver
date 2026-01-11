-- Add new columns to match Congress.gov Excel export
ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS url text,
ADD COLUMN IF NOT EXISTS committees text,
ADD COLUMN IF NOT EXISTS subject_terms text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS related_bill_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS related_bills text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS amends_bill text;

-- Add comments for documentation
COMMENT ON COLUMN bills.url IS 'Direct Congress.gov URL for the bill';
COMMENT ON COLUMN bills.committees IS 'Assigned committee(s) for the bill';
COMMENT ON COLUMN bills.subject_terms IS 'Array of bill subject terms from Congress.gov';
COMMENT ON COLUMN bills.related_bill_count IS 'Number of related bills';
COMMENT ON COLUMN bills.related_bills IS 'Array of related bill IDs (e.g., S.2354, H.R.4754)';
COMMENT ON COLUMN bills.amends_bill IS 'Bill ID this bill amends, if any';