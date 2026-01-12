-- Add raw_cosponsors column to store cosponsor names from Excel imports
ALTER TABLE bills ADD COLUMN IF NOT EXISTS raw_cosponsors text[];