-- Drop the existing materialized view and its dependencies
DROP FUNCTION IF EXISTS public.refresh_bill_summary_stats();
DROP MATERIALIZED VIEW IF EXISTS public.bill_summary_stats;

-- Recreate the materialized view with a proper id column for concurrent refresh
CREATE MATERIALIZED VIEW public.bill_summary_stats AS
SELECT
  1 AS id,
  COUNT(*) AS total_bills,
  COUNT(*) FILTER (WHERE summary IS NOT NULL AND summary NOT LIKE '[%') AS with_crs_summary,
  COUNT(*) FILTER (WHERE summary IS NOT NULL AND summary LIKE '[AI%') AS with_ai_summary,
  COUNT(*) FILTER (WHERE summary IS NOT NULL AND summary LIKE '[AI Procedural%') AS with_ai_procedural_summary,
  COUNT(*) FILTER (WHERE summary IS NULL OR summary LIKE '[%') AS no_summary_available,
  COUNT(*) FILTER (WHERE summary_fetched_at IS NULL) AS pending_fetch,
  COUNT(*) FILTER (WHERE topic_flag IS NOT NULL) AS flagged_count,
  COUNT(*) FILTER (WHERE topic_flag = 'mismatch') AS mismatch_count,
  COUNT(*) FILTER (WHERE omnibus_type IS NOT NULL) AS omnibus_count,
  COUNT(*) FILTER (WHERE array_length(additional_topics, 1) > 0) AS multi_topic_count,
  COUNT(*) FILTER (WHERE congress = 118) AS congress_118_count,
  COUNT(*) FILTER (WHERE congress = 119) AS congress_119_count,
  COUNT(*) FILTER (WHERE topic = 'healthcare') AS healthcare_count,
  COUNT(*) FILTER (WHERE topic = 'economy') AS economy_count,
  COUNT(*) FILTER (WHERE topic = 'education') AS education_count,
  COUNT(*) FILTER (WHERE topic = 'environment') AS environment_count,
  COUNT(*) FILTER (WHERE topic = 'defense') AS defense_count,
  COUNT(*) FILTER (WHERE topic = 'immigration') AS immigration_count,
  COUNT(*) FILTER (WHERE topic = 'civil-rights') AS civil_rights_count,
  COUNT(*) FILTER (WHERE topic = 'government') AS government_count,
  COUNT(*) FILTER (WHERE topic = 'science') AS science_count,
  COUNT(*) FILTER (WHERE topic = 'native-affairs') AS native_affairs_count,
  NOW() AS last_refreshed
FROM public.bills;

-- Create unique index on the id column for CONCURRENTLY refresh
CREATE UNIQUE INDEX bill_summary_stats_id_idx ON public.bill_summary_stats (id);

-- Recreate the refresh function with extended timeout
CREATE OR REPLACE FUNCTION public.refresh_bill_summary_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '300000'
SET lock_timeout = '30000'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY bill_summary_stats;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.refresh_bill_summary_stats() TO authenticated;