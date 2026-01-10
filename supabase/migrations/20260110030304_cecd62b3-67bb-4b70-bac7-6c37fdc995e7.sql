-- Add needs_ai_generation metric and topic breakdown to bill_summary_stats
-- needs_ai_generation = bills where CRS fetch was attempted but no summary found

DROP MATERIALIZED VIEW IF EXISTS bill_summary_stats;

CREATE MATERIALIZED VIEW bill_summary_stats AS
SELECT
  1 AS id,
  COUNT(*) AS total_bills,
  COUNT(*) FILTER (WHERE summary IS NOT NULL AND summary NOT LIKE '[%') AS with_crs_summary,
  COUNT(*) FILTER (WHERE summary LIKE '[AI%') AS with_ai_summary,
  COUNT(*) FILTER (WHERE summary LIKE '[AI-Procedural%') AS with_ai_procedural_summary,
  COUNT(*) FILTER (WHERE summary IS NULL) AS no_summary_available,
  COUNT(*) FILTER (WHERE summary IS NULL AND summary_fetched_at IS NOT NULL) AS needs_ai_generation,
  COUNT(*) FILTER (WHERE summary_fetched_at IS NULL) AS pending_fetch,
  COUNT(*) FILTER (WHERE topic_flag IS NOT NULL) AS flagged_count,
  COUNT(*) FILTER (WHERE ai_detected_topics IS NOT NULL AND ai_detected_topics[1] IS DISTINCT FROM topic) AS mismatch_count,
  COUNT(*) FILTER (WHERE additional_topics IS NOT NULL AND array_length(additional_topics, 1) > 0) AS multi_topic_count,
  COUNT(*) FILTER (WHERE omnibus_type IS NOT NULL) AS omnibus_count,
  COUNT(*) FILTER (WHERE congress = 118) AS congress_118_count,
  COUNT(*) FILTER (WHERE congress = 119) AS congress_119_count,
  -- Topic breakdown
  COUNT(*) FILTER (WHERE topic = 'Economy & Jobs') AS topic_economy,
  COUNT(*) FILTER (WHERE topic = 'Health & Welfare') AS topic_health,
  COUNT(*) FILTER (WHERE topic = 'Environment & Energy') AS topic_environment,
  COUNT(*) FILTER (WHERE topic = 'Education') AS topic_education,
  COUNT(*) FILTER (WHERE topic = 'Defense & Foreign Policy') AS topic_defense,
  COUNT(*) FILTER (WHERE topic = 'Civil Rights & Liberties') AS topic_civil_rights,
  COUNT(*) FILTER (WHERE topic = 'Immigration & Society') AS topic_immigration,
  COUNT(*) FILTER (WHERE topic = 'Government & Politics') AS topic_government,
  COUNT(*) FILTER (WHERE topic = 'Science & Technology') AS topic_science,
  COUNT(*) FILTER (WHERE topic = 'Native & Tribal Affairs') AS topic_native,
  COUNT(*) FILTER (WHERE topic IS NULL OR topic NOT IN (
    'Economy & Jobs', 'Health & Welfare', 'Environment & Energy', 'Education',
    'Defense & Foreign Policy', 'Civil Rights & Liberties', 'Immigration & Society',
    'Government & Politics', 'Science & Technology', 'Native & Tribal Affairs'
  )) AS topic_uncategorized,
  now() AS last_refreshed
FROM bills;

CREATE UNIQUE INDEX ON bill_summary_stats (id);