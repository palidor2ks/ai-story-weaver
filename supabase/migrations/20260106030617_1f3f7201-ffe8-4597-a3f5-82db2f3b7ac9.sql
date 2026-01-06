-- Create partial index for fast backfill queries on votes table
-- This index only includes rows that need processing (null summary, has congress number)

CREATE INDEX IF NOT EXISTS votes_pending_summaries_idx 
ON votes (id) 
WHERE bill_summary IS NULL AND congress IS NOT NULL;