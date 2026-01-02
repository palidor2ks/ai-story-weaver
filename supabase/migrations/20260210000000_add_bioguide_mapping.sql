-- Add bioguide_id to candidates so we can map votes coming from Congress.gov
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS bioguide_id TEXT;

-- Backfill for existing federal legislators that already use the bioguide format
UPDATE candidates
SET bioguide_id = id
WHERE bioguide_id IS NULL
  AND id ~ '^[A-Z][0-9]{6}$';

-- Ensure we don't store duplicates for the same member
CREATE INDEX IF NOT EXISTS candidates_bioguide_id_idx ON candidates (bioguide_id);
