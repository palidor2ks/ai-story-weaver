-- Add foreign key constraint to enable Supabase embedded joins.
--
-- Earlier candidate_committees table definitions may have already created this
-- constraint implicitly from an inline REFERENCES clause. Drop it first so this
-- migration can be replayed safely and so the nullable candidate_id column uses
-- ON DELETE SET NULL instead of the original cascade behavior.
ALTER TABLE public.candidate_committees
DROP CONSTRAINT IF EXISTS candidate_committees_candidate_id_fkey;

ALTER TABLE public.candidate_committees
ADD CONSTRAINT candidate_committees_candidate_id_fkey
FOREIGN KEY (candidate_id) REFERENCES public.candidates(id)
ON DELETE SET NULL;
