-- Add display_name column to donors table
ALTER TABLE donors ADD COLUMN IF NOT EXISTS display_name text;