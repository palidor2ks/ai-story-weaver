-- Fix [NO_SUMMARY] detection in bill_summary_stats materialized view
DROP MATERIALIZED VIEW IF EXISTS bill_summary_stats;

CREATE MATERIALIZED VIEW bill_summary_stats AS
SELECT 
  1 AS id,
  COUNT(*) AS total_bills,
  
  -- CRS Summaries: non-null, not empty, and not any bracket-prefixed marker
  COUNT(*) FILTER (WHERE summary IS NOT NULL 
    AND summary != '' 
    AND summary NOT LIKE '[%') AS with_crs_summary,
  
  -- AI Summaries (includes [AI] and [AI-PROC] prefixes)
  COUNT(*) FILTER (WHERE summary LIKE '[AI%') AS with_ai_summary,
  
  -- Procedural AI summaries specifically
  COUNT(*) FILTER (WHERE summary LIKE '[AI-PROC%') AS with_ai_procedural_summary,
  
  -- Bills with [NO_SUMMARY] marker (CRS fetch returned empty)
  COUNT(*) FILTER (WHERE summary = '[NO_SUMMARY]') AS no_summary_available,
  
  -- Bills that need AI generation: have [NO_SUMMARY] and were fetched
  COUNT(*) FILTER (WHERE summary = '[NO_SUMMARY]' 
    AND summary_fetched_at IS NOT NULL) AS needs_ai_generation,
  
  -- Bills never fetched yet (NULL summary)
  COUNT(*) FILTER (WHERE summary IS NULL) AS pending_fetch,
  
  -- Topic flagging stats
  COUNT(*) FILTER (WHERE topic_flag IS NOT NULL) AS flagged_count,
  COUNT(*) FILTER (WHERE ai_detected_topics IS NOT NULL 
    AND ai_detected_topics[1] IS DISTINCT FROM topic) AS mismatch_count,
  COUNT(*) FILTER (WHERE additional_topics IS NOT NULL 
    AND array_length(additional_topics, 1) > 0) AS multi_topic_count,
  COUNT(*) FILTER (WHERE omnibus_type IS NOT NULL) AS omnibus_count,
  
  -- Congress breakdown
  COUNT(*) FILTER (WHERE congress = 118) AS congress_118_count,
  COUNT(*) FILTER (WHERE congress = 119) AS congress_119_count,
  
  -- Topic distribution
  COUNT(*) FILTER (WHERE topic = 'Economy') AS topic_economy,
  COUNT(*) FILTER (WHERE topic = 'Healthcare') AS topic_health,
  COUNT(*) FILTER (WHERE topic = 'Environment') AS topic_environment,
  COUNT(*) FILTER (WHERE topic = 'Education') AS topic_education,
  COUNT(*) FILTER (WHERE topic = 'Defense') AS topic_defense,
  COUNT(*) FILTER (WHERE topic = 'Civil Rights') AS topic_civil_rights,
  COUNT(*) FILTER (WHERE topic = 'Immigration') AS topic_immigration,
  COUNT(*) FILTER (WHERE topic = 'Government') AS topic_government,
  COUNT(*) FILTER (WHERE topic = 'Technology') AS topic_science,
  COUNT(*) FILTER (WHERE topic = 'Native Americans') AS topic_native,
  COUNT(*) FILTER (WHERE topic = 'Social Programs') AS topic_social,
  COUNT(*) FILTER (WHERE topic IS NULL OR topic NOT IN (
    'Economy', 'Healthcare', 'Environment', 'Education', 'Defense', 
    'Civil Rights', 'Immigration', 'Government', 'Technology', 'Native Americans', 'Social Programs'
  )) AS topic_uncategorized,
  
  NOW() AS last_refreshed
FROM bills;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX ON bill_summary_stats (id);