-- Add/recreate foreign key constraint to enable Supabase embedded joins.
-- Earlier migrations may already have created this FK implicitly, so drop it first
-- to make this migration idempotent across fresh and partially migrated databases.
ALTER TABLE public.candidate_committees
DROP CONSTRAINT IF EXISTS candidate_committees_candidate_id_fkey;

ALTER TABLE public.candidate_committees
ADD CONSTRAINT candidate_committees_candidate_id_fkey
FOREIGN KEY (candidate_id) REFERENCES public.candidates(id)
ON DELETE SET NULL;
