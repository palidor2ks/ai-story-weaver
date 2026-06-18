-- RPC that returns only candidates in non-hidden states, mirroring
-- get_visible_candidate_topic_scores. Lets useCandidates fire its 3
-- parallel queries immediately without waiting for useHiddenStates first.
CREATE OR REPLACE FUNCTION public.get_visible_candidates()
RETURNS TABLE(
  id text,
  name text,
  party text,
  office text,
  state text,
  district text,
  image_url text,
  overall_score numeric,
  coverage_tier text,
  confidence text,
  is_incumbent boolean,
  score_version text,
  last_updated timestamptz,
  claimed_by_user_id uuid,
  claimed_at timestamptz,
  fec_candidate_id text,
  last_donor_sync timestamptz,
  person_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    c.id,
    c.name,
    c.party::text,
    c.office,
    c.state,
    c.district,
    c.image_url,
    c.overall_score,
    c.coverage_tier::text,
    c.confidence::text,
    c.is_incumbent,
    c.score_version,
    c.last_updated,
    c.claimed_by_user_id,
    c.claimed_at,
    c.fec_candidate_id,
    c.last_donor_sync,
    c.person_id
  FROM public.candidates c
  WHERE c.state NOT IN (SELECT state_code FROM public.hidden_states)
  ORDER BY c.name;
$$;
