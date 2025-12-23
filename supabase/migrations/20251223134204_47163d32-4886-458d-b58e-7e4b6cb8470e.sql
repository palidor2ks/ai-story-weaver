-- Add FEC candidate ID column to candidates table
ALTER TABLE candidates 
ADD COLUMN fec_candidate_id text;

-- Create index for faster lookups
CREATE INDEX idx_candidates_fec_id ON candidates(fec_candidate_id) WHERE fec_candidate_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN candidates.fec_candidate_id IS 'FEC-specific candidate ID used to fetch campaign finance data from the FEC API';