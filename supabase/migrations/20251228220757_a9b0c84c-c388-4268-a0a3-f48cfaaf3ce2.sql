-- Add cycles array and is_terminated columns to candidate_committees
ALTER TABLE candidate_committees 
ADD COLUMN IF NOT EXISTS cycles text[],
ADD COLUMN IF NOT EXISTS is_terminated boolean DEFAULT false;