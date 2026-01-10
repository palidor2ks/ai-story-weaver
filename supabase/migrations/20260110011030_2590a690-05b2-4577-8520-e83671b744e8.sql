-- =============================================
-- FULL PURGE: Drop old votes table and related objects
-- =============================================

-- Drop the backward-compatibility view first (depends on votes table)
DROP VIEW IF EXISTS votes_expanded;

-- Drop the old votes table (CASCADE will drop any dependent objects)
DROP TABLE IF EXISTS votes CASCADE;

-- Drop any migration functions that are no longer needed
DROP FUNCTION IF EXISTS migrate_bills_batch(integer);
DROP FUNCTION IF EXISTS migrate_candidate_votes_batch(integer);

-- Update the candidate_voting_coverage view to use new tables
DROP VIEW IF EXISTS candidate_voting_coverage;

CREATE VIEW candidate_voting_coverage AS
SELECT 
  c.id as candidate_id,
  c.name,
  c.office,
  c.party,
  -- Count legislative actions (sponsored/cosponsored)
  COUNT(cv.id) FILTER (WHERE cv.action_type IN ('sponsor', 'cosponsor')) as legislative_actions_count,
  -- Count floor votes (yea/nay/present/not voting)
  COUNT(cv.id) FILTER (WHERE cv.action_type = 'floor_vote') as floor_votes_count,
  -- Total votes stored
  COUNT(cv.id) as total_votes_stored,
  -- Count distinct topics covered
  COUNT(DISTINCT b.topic) as topics_covered,
  -- Last vote date
  MAX(cv.action_date) as last_vote_date,
  -- Last floor vote date
  MAX(cv.action_date) FILTER (WHERE cv.action_type = 'floor_vote') as last_floor_vote_date
FROM candidates c
LEFT JOIN candidate_votes cv ON c.id = cv.candidate_id
LEFT JOIN bills b ON cv.bill_id = b.id
WHERE c.office IN ('U.S. Senator', 'U.S. Representative')
GROUP BY c.id, c.name, c.office, c.party;

-- Update bill_summary_stats materialized view to use bills table
DROP MATERIALIZED VIEW IF EXISTS bill_summary_stats;

CREATE MATERIALIZED VIEW bill_summary_stats AS
SELECT 
  COUNT(*) as total_bills,
  COUNT(*) FILTER (WHERE summary IS NOT NULL AND summary != '' AND summary != '[NO_SUMMARY]') as with_crs_summary,
  COUNT(*) FILTER (WHERE summary = '[NO_SUMMARY]') as no_summary_available,
  COUNT(*) FILTER (WHERE summary IS NULL OR summary = '') as pending_fetch,
  -- Congress breakdown
  COUNT(*) FILTER (WHERE congress = 118) as congress_118_count,
  COUNT(*) FILTER (WHERE congress = 119) as congress_119_count,
  -- Topic breakdown
  COUNT(*) FILTER (WHERE topic = 'Economy') as economy_count,
  COUNT(*) FILTER (WHERE topic = 'Healthcare') as healthcare_count,
  COUNT(*) FILTER (WHERE topic = 'Education') as education_count,
  COUNT(*) FILTER (WHERE topic = 'Environment') as environment_count,
  COUNT(*) FILTER (WHERE topic = 'Immigration') as immigration_count,
  COUNT(*) FILTER (WHERE topic = 'Defense') as defense_count,
  COUNT(*) FILTER (WHERE topic = 'Civil Rights') as civil_rights_count,
  COUNT(*) FILTER (WHERE topic = 'Government') as government_count,
  COUNT(*) FILTER (WHERE topic = 'Science') as science_count,
  COUNT(*) FILTER (WHERE topic = 'Native Affairs') as native_affairs_count,
  -- Flag breakdown
  COUNT(*) FILTER (WHERE topic_flag IS NOT NULL) as flagged_count,
  COUNT(*) FILTER (WHERE topic_flag = 'mismatch') as mismatch_count,
  COUNT(*) FILTER (WHERE topic_flag = 'multi_topic') as multi_topic_count,
  COUNT(*) FILTER (WHERE omnibus_type IS NOT NULL) as omnibus_count,
  -- Timestamps
  NOW() as last_refreshed
FROM bills;

-- Create index for refresh
CREATE UNIQUE INDEX IF NOT EXISTS bill_summary_stats_singleton ON bill_summary_stats ((1));

-- Grant permissions
GRANT SELECT ON candidate_voting_coverage TO authenticated, anon;
GRANT SELECT ON bill_summary_stats TO authenticated, anon;