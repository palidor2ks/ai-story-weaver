-- Rotation config for the daily social post. The picker (pick-daily-stat-card)
-- cycles through `rotation_types` so the daily post alternates between content
-- types — e.g. a rep stat-card one day and an AI analysis the next.
--
--   rotation_types : ordered list of subject_types to cycle through
--   rotation_index : pointer into rotation_types; advanced after each draft

ALTER TABLE public.social_post_settings
  ADD COLUMN IF NOT EXISTS rotation_types TEXT[] NOT NULL
    DEFAULT ARRAY['rep_profile', 'ai_analysis'],
  ADD COLUMN IF NOT EXISTS rotation_index INTEGER NOT NULL DEFAULT 0;
