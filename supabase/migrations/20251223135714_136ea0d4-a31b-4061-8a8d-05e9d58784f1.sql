-- Add last_donor_sync column to candidates table
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS last_donor_sync timestamptz;

-- Enable pg_net extension for HTTP calls from cron jobs
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;