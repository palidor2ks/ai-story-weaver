-- Drop and recreate bill_summary_stats with all topics and congress counts
DROP MATERIALIZED VIEW IF EXISTS bill_summary_stats;

CREATE MATERIALIZED VIEW bill_summary_stats AS
SELECT 
  1 AS id,
  count(*) AS total_bills,
  count(*) FILTER (WHERE summary IS NOT NULL AND summary <> '' AND summary NOT LIKE '[%') AS with_crs_summary,
  count(*) FILTER (WHERE summary LIKE '[AI%') AS with_ai_summary,
  count(*) FILTER (WHERE summary LIKE '[AI-PROC%') AS with_ai_procedural_summary,
  count(*) FILTER (WHERE summary = '[NO_SUMMARY]') AS no_summary_available,
  count(*) FILTER (WHERE summary = '[NO_SUMMARY]' AND summary_fetched_at IS NOT NULL) AS needs_ai_generation,
  count(*) FILTER (WHERE summary IS NULL) AS pending_fetch,
  count(*) FILTER (WHERE topic_flag IS NOT NULL) AS flagged_count,
  count(*) FILTER (WHERE ai_detected_topics IS NOT NULL AND ai_detected_topics[1] IS DISTINCT FROM topic) AS mismatch_count,
  count(*) FILTER (WHERE additional_topics IS NOT NULL AND array_length(additional_topics, 1) > 0) AS multi_topic_count,
  count(*) FILTER (WHERE omnibus_type IS NOT NULL) AS omnibus_count,
  -- Congress counts (114-119)
  count(*) FILTER (WHERE congress = 114) AS congress_114_count,
  count(*) FILTER (WHERE congress = 115) AS congress_115_count,
  count(*) FILTER (WHERE congress = 116) AS congress_116_count,
  count(*) FILTER (WHERE congress = 117) AS congress_117_count,
  count(*) FILTER (WHERE congress = 118) AS congress_118_count,
  count(*) FILTER (WHERE congress = 119) AS congress_119_count,
  -- Topic counts (all 12 canonical topics + uncategorized)
  count(*) FILTER (WHERE topic = 'Economy') AS topic_economy,
  count(*) FILTER (WHERE topic = 'Healthcare') AS topic_health,
  count(*) FILTER (WHERE topic = 'Environment') AS topic_environment,
  count(*) FILTER (WHERE topic = 'Education') AS topic_education,
  count(*) FILTER (WHERE topic = 'Defense') AS topic_defense,
  count(*) FILTER (WHERE topic = 'Foreign Affairs') AS topic_foreign_affairs,
  count(*) FILTER (WHERE topic = 'Civil Rights') AS topic_civil_rights,
  count(*) FILTER (WHERE topic = 'Immigration') AS topic_immigration,
  count(*) FILTER (WHERE topic = 'Government') AS topic_government,
  count(*) FILTER (WHERE topic = 'Technology') AS topic_science,
  count(*) FILTER (WHERE topic = 'Native Americans') AS topic_native,
  count(*) FILTER (WHERE topic = 'Social Programs') AS topic_social,
  count(*) FILTER (WHERE topic = 'Judicial') AS topic_judicial,
  count(*) FILTER (WHERE topic IS NULL OR topic NOT IN (
    'Economy', 'Healthcare', 'Environment', 'Education', 'Defense', 'Foreign Affairs',
    'Civil Rights', 'Immigration', 'Government', 'Technology', 'Native Americans', 
    'Social Programs', 'Judicial'
  )) AS topic_uncategorized,
  now() AS last_refreshed
FROM bills;

-- Refresh to populate the view
REFRESH MATERIALIZED VIEW bill_summary_stats;