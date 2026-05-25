DROP INDEX IF EXISTS public.ai_analysis_cache_key_idx;

ALTER TABLE public.ai_analysis_cache
  ADD CONSTRAINT ai_analysis_cache_key_uniq
  UNIQUE NULLS NOT DISTINCT (kind, subject_id, cycle, user_id, input_fingerprint);