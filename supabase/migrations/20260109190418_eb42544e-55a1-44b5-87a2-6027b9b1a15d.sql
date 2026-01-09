-- Part 5: Migration for floor vote and bill summary improvements
-- 1. Convert existing [FLOOR_VOTE] markers to [NO_SUMMARY] so they get picked up by AI generation
-- 2. Update materialized view to track new summary categories

-- Step 1: Convert [FLOOR_VOTE] to [NO_SUMMARY] for existing records
UPDATE votes 
SET bill_summary = '[NO_SUMMARY]'
WHERE bill_summary = '[FLOOR_VOTE]';

-- Step 2: Drop and recreate materialized view with new columns
DROP MATERIALIZED VIEW IF EXISTS bill_summary_stats;

CREATE MATERIALIZED VIEW bill_summary_stats AS
SELECT 
  1 as id,
  COUNT(*) as total_votes,
  
  -- CRS summaries (official from Congress.gov - not starting with [AI] or markers)
  COUNT(*) FILTER (
    WHERE bill_summary IS NOT NULL 
    AND bill_summary NOT LIKE '[%' 
    AND bill_summary != ''
  ) as with_crs_summary,
  
  -- AI summaries for regular bills [AI]
  COUNT(*) FILTER (
    WHERE bill_summary LIKE '[AI] %'
  ) as with_ai_summary,
  
  -- AI summaries for procedural votes [AI-PROC]
  COUNT(*) FILTER (
    WHERE bill_summary LIKE '[AI-PROC] %'
  ) as with_ai_procedural_summary,
  
  -- Votes that need AI summary (no CRS available)
  COUNT(*) FILTER (
    WHERE bill_summary = '[NO_SUMMARY]'
  ) as no_summary_available,
  
  -- Not yet fetched (NULL summary)
  COUNT(*) FILTER (
    WHERE bill_summary IS NULL
  ) as not_yet_fetched,
  
  -- Procedural votes still pending AI generation
  -- These are VOTE-xxx IDs with [NO_SUMMARY] marker
  COUNT(*) FILTER (
    WHERE bill_summary = '[NO_SUMMARY]'
    AND (bill_id LIKE 'VOTE-%' OR bill_id LIKE 'vote-%')
  ) as procedural_votes_pending,
  
  -- Legacy column for backwards compatibility (kept for UI transition)
  COUNT(*) FILTER (
    WHERE bill_summary = '[FLOOR_VOTE]'
    OR (bill_summary = '[NO_SUMMARY]' AND (bill_id LIKE 'VOTE-%' OR bill_id LIKE 'vote-%'))
  ) as floor_votes_no_bill,
  
  -- Full text titles (not parseable as bill IDs)
  COUNT(*) FILTER (
    WHERE bill_summary = '[TITLE_NOT_ID]'
  ) as full_text_titles,
  
  -- Unparseable bill IDs
  COUNT(*) FILTER (
    WHERE bill_summary = '[UNPARSEABLE]'
  ) as unparseable_bill_ids,
  
  -- Missing congress number (required for CRS lookup)
  COUNT(*) FILTER (
    WHERE congress IS NULL
  ) as missing_congress,
  
  NOW() as last_refreshed
FROM votes;

-- Create unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX bill_summary_stats_id_idx ON bill_summary_stats(id);

-- Grant access
GRANT SELECT ON bill_summary_stats TO authenticated;
GRANT SELECT ON bill_summary_stats TO anon;