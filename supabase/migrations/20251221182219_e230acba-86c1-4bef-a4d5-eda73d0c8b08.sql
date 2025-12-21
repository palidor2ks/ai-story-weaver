-- Backfill image_url for existing candidates with bioguide IDs
-- Bioguide IDs follow the pattern: one capital letter followed by 6 digits (e.g., A000360)
UPDATE public.candidates 
SET image_url = CONCAT('https://bioguide.congress.gov/bioguide/photo/', LEFT(id, 1), '/', id, '.jpg')
WHERE image_url IS NULL 
  AND id ~ '^[A-Z][0-9]{6}$';