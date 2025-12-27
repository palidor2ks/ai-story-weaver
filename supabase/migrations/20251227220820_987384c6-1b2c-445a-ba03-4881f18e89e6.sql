-- Clean up legacy duplicate donors
-- Legacy records have NULL recipient_committee_id and human-readable IDs (fec-name-candidate-cycle)
-- New records have recipient_committee_id populated and hash-based IDs

-- Delete legacy donor records where a newer hash-based record exists for the same donor identity
DELETE FROM donors legacy
WHERE legacy.recipient_committee_id IS NULL
  AND EXISTS (
    SELECT 1 FROM donors newer
    WHERE newer.recipient_committee_id IS NOT NULL
      AND newer.candidate_id = legacy.candidate_id
      AND newer.cycle = legacy.cycle
      AND newer.type = legacy.type
      AND LOWER(TRIM(newer.name)) = LOWER(TRIM(legacy.name))
  );

-- Also delete any remaining legacy records that have NULL recipient_committee_id
-- These are orphaned records from the old sync process that don't match current data
-- Keep only records with proper committee tracking
DELETE FROM donors 
WHERE recipient_committee_id IS NULL;