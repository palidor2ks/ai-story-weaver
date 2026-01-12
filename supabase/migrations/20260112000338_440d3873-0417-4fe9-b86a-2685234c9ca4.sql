-- Add last_ai_scan_at column to bills table to track when bills were last AI-scanned
ALTER TABLE bills ADD COLUMN IF NOT EXISTS last_ai_scan_at timestamptz;

-- Create index for efficient querying of recently scanned bills
CREATE INDEX IF NOT EXISTS idx_bills_last_ai_scan_at ON bills(last_ai_scan_at);