-- Fix no_summary_available to exclude AI-generated summaries
-- Previously it counted summary LIKE '[%' which incorrectly included [AI...] summaries

DROP MATERIALIZED VIEW IF EXISTS bill_summary_stats;

CREATE MATERIALIZED VIEW bill_summary_stats AS
SELECT
  1 AS id,
  COUNT(*) AS total_bills,
  COUNT(*) FILTER (WHERE summary IS NOT NULL AND summary NOT LIKE '[%') AS with_crs_summary,
  COUNT(*) FILTER (WHERE summary LIKE '[AI%') AS with_ai_summary,
  COUNT(*) FILTER (WHERE summary LIKE '[AI-Procedural%') AS with_ai_procedural_summary,
  COUNT(*) FILTER (WHERE summary IS NULL) AS no_summary_available,
  COUNT(*) FILTER (WHERE summary_fetched_at IS NULL) AS pending_fetch,
  COUNT(*) FILTER (WHERE topic_flag IS NOT NULL) AS flagged_count,
  COUNT(*) FILTER (WHERE ai_detected_topics IS NOT NULL AND ai_detected_topics[1] IS DISTINCT FROM topic) AS mismatch_count,
  COUNT(*) FILTER (WHERE additional_topics IS NOT NULL AND array_length(additional_topics, 1) > 0) AS multi_topic_count,
  COUNT(*) FILTER (WHERE omnibus_type IS NOT NULL) AS omnibus_count,
  COUNT(*) FILTER (WHERE congress = 118) AS congress_118_count,
  COUNT(*) FILTER (WHERE congress = 119) AS congress_119_count,
  now() AS last_refreshed
FROM bills;

CREATE UNIQUE INDEX ON bill_summary_stats (id);