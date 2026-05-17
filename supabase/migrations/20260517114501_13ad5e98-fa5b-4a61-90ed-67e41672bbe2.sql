ALTER TABLE public.donor_aliases
  ADD COLUMN IF NOT EXISTS fec_committee_ids text[] NOT NULL DEFAULT '{}'::text[];

UPDATE public.donor_aliases
   SET fec_committee_ids = ARRAY[fec_committee_id]
 WHERE fec_committee_id IS NOT NULL
   AND (fec_committee_ids IS NULL OR array_length(fec_committee_ids, 1) IS NULL);