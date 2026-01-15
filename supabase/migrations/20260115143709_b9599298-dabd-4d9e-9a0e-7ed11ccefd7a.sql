-- Drop the function-based index that uses COALESCE (incompatible with Supabase upsert)
DROP INDEX IF EXISTS idx_candidate_votes_unique;

-- Create a plain unique constraint that works with Supabase upsert onConflict
ALTER TABLE candidate_votes 
ADD CONSTRAINT candidate_votes_unique_key 
UNIQUE (bill_id, candidate_id, action_type, vote_number);