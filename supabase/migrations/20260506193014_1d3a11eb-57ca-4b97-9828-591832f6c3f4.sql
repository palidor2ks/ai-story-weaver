
ALTER TABLE public.candidate_overrides
ADD COLUMN is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.candidate_overrides.is_active IS 'When false, override is ignored and base candidate data is used instead';
