-- Drop the existing materialized view and recreate with proper unique column
DROP MATERIALIZED VIEW IF EXISTS bill_summary_stats;

CREATE MATERIALIZED VIEW bill_summary_stats AS
SELECT 
  1 as id,
  COUNT(*) as total_votes,
  COUNT(*) FILTER (WHERE bill_summary IS NOT NULL 
    AND bill_summary NOT IN ('[NO_SUMMARY]', '[FLOOR_VOTE]', '[TITLE_NOT_ID]', '[UNPARSEABLE]')
    AND bill_summary NOT ILIKE '[AI]%') as with_crs_summary,
  COUNT(*) FILTER (WHERE bill_summary ILIKE '[AI]%') as with_ai_summary,
  COUNT(*) FILTER (WHERE bill_summary = '[NO_SUMMARY]') as no_summary_available,
  COUNT(*) FILTER (WHERE bill_summary IS NULL 
    AND bill_id NOT ILIKE 'VOTE-%' 
    AND congress IS NOT NULL) as not_yet_fetched,
  COUNT(*) FILTER (WHERE bill_id ILIKE 'VOTE-%') as floor_votes_no_bill,
  COUNT(*) FILTER (WHERE bill_summary = '[TITLE_NOT_ID]') as full_text_titles,
  COUNT(*) FILTER (WHERE bill_summary = '[UNPARSEABLE]') as unparseable_bill_ids,
  COUNT(*) FILTER (WHERE congress IS NULL) as missing_congress,
  NOW() as last_refreshed
FROM votes;

-- Create unique index on the id column for concurrent refresh
CREATE UNIQUE INDEX bill_summary_stats_id_idx ON bill_summary_stats (id);

-- Recreate the refresh function
CREATE OR REPLACE FUNCTION public.refresh_bill_summary_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY bill_summary_stats;
END;
$$;

-- Grant access
GRANT SELECT ON bill_summary_stats TO authenticated;
GRANT SELECT ON bill_summary_stats TO anon;
GRANT EXECUTE ON FUNCTION refresh_bill_summary_stats() TO authenticated;