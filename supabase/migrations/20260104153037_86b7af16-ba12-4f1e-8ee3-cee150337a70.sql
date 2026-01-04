-- Add bill_summary column to store full CRS summaries (no character limit)
ALTER TABLE votes ADD COLUMN IF NOT EXISTS bill_summary text;

-- Add timestamp to track when summary was fetched (for future refresh logic)
ALTER TABLE votes ADD COLUMN IF NOT EXISTS summary_fetched_at timestamp with time zone;