CREATE UNIQUE INDEX IF NOT EXISTS profile_claims_unique_active_per_candidate
  ON public.profile_claims (candidate_id)
  WHERE status IN ('pending', 'approved');