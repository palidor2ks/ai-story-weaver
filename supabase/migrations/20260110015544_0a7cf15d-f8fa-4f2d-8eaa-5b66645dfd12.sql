-- Drop obsolete database functions that referenced the old votes table
DROP FUNCTION IF EXISTS public.get_vote_action_counts();
DROP FUNCTION IF EXISTS public.refresh_vote_action_counts();

-- Drop obsolete materialized view if it exists
DROP MATERIALIZED VIEW IF EXISTS public.vote_action_counts;

-- Drop topic_legacy_mapping table (0 rows, unused)
DROP TABLE IF EXISTS public.topic_legacy_mapping;

-- Recreate bill_summary_stats materialized view to query the new bills table
DROP MATERIALIZED VIEW IF EXISTS public.bill_summary_stats;

CREATE MATERIALIZED VIEW public.bill_summary_stats AS
SELECT
  -- Total counts
  COUNT(*) AS total_bills,
  
  -- Summary status counts
  COUNT(*) FILTER (WHERE summary IS NOT NULL AND summary NOT LIKE '[%') AS with_crs_summary,
  COUNT(*) FILTER (WHERE summary LIKE '[AI]%') AS with_ai_summary,
  COUNT(*) FILTER (WHERE summary LIKE '[AI-PROC]%') AS with_ai_procedural_summary,
  COUNT(*) FILTER (WHERE summary = '[NO_SUMMARY]') AS no_summary_available,
  COUNT(*) FILTER (WHERE summary IS NULL) AS pending_fetch,
  
  -- Congress breakdown
  COUNT(*) FILTER (WHERE congress = 118) AS congress_118_count,
  COUNT(*) FILTER (WHERE congress = 119) AS congress_119_count,
  
  -- Topic breakdown (using canonical topic names)
  COUNT(*) FILTER (WHERE topic = 'Economy') AS economy_count,
  COUNT(*) FILTER (WHERE topic = 'Healthcare') AS healthcare_count,
  COUNT(*) FILTER (WHERE topic = 'Immigration') AS immigration_count,
  COUNT(*) FILTER (WHERE topic = 'Environment') AS environment_count,
  COUNT(*) FILTER (WHERE topic = 'Defense') AS defense_count,
  COUNT(*) FILTER (WHERE topic = 'Education') AS education_count,
  COUNT(*) FILTER (WHERE topic = 'Civil Rights') AS civil_rights_count,
  COUNT(*) FILTER (WHERE topic = 'Government') AS government_count,
  COUNT(*) FILTER (WHERE topic = 'Social Programs') AS native_affairs_count,
  COUNT(*) FILTER (WHERE topic = 'Technology') AS science_count,
  
  -- Topic flags
  COUNT(*) FILTER (WHERE topic_flag IS NOT NULL AND reviewed_at IS NULL) AS flagged_count,
  COUNT(*) FILTER (WHERE topic_flag = 'possible_mismatch') AS mismatch_count,
  COUNT(*) FILTER (WHERE topic_flag IN ('multi_topic_detected', 'omnibus_detected', 'omnibus_major')) AS multi_topic_count,
  COUNT(*) FILTER (WHERE omnibus_type IS NOT NULL) AS omnibus_count,
  
  -- Timestamp
  NOW() AS last_refreshed
FROM public.bills;

-- Create index for faster refresh
CREATE UNIQUE INDEX ON public.bill_summary_stats ((1));

-- Grant permissions
GRANT SELECT ON public.bill_summary_stats TO anon, authenticated;