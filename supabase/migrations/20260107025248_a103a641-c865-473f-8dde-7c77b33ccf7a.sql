-- Create function to get vote counts grouped by action_type (fast, uses index)
CREATE OR REPLACE FUNCTION public.get_vote_action_counts()
RETURNS TABLE(action_type text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT action_type, COUNT(*)::bigint 
  FROM votes 
  GROUP BY action_type;
$$;