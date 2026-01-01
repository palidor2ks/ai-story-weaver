-- Add source_titles column to store display names for each source URL
ALTER TABLE public.candidate_answers ADD COLUMN IF NOT EXISTS source_titles text[];
ALTER TABLE public.party_answers ADD COLUMN IF NOT EXISTS source_titles text[];