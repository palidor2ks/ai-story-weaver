-- Add demographic columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS political_party text,
ADD COLUMN IF NOT EXISTS age integer,
ADD COLUMN IF NOT EXISTS income text,
ADD COLUMN IF NOT EXISTS sex text;

-- Create enum for income ranges
-- Note: Using text for flexibility, but could use enum if needed