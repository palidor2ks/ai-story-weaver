-- Create materialized view for pre-aggregated vote action counts
CREATE MATERIALIZED VIEW vote_action_counts AS
SELECT 
  action_type,
  COUNT(*)::bigint as count
FROM votes
GROUP BY action_type;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX vote_action_counts_action_type_idx 
ON vote_action_counts (action_type);

-- Create function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_vote_action_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY vote_action_counts;
END;
$$;