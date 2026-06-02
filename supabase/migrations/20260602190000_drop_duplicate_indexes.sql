-- Drop duplicate indexes flagged by the Supabase performance advisor
-- (lint 0009_duplicate_index). Each pair below covers the exact same columns,
-- so a single index/constraint of each is sufficient. Removing the redundant
-- copy saves storage and write overhead with no change to query behavior.

-- candidate_answers: two identical UNIQUE constraints on (candidate_id, question_id).
-- Both are constraint-backed (not plain indexes), so we DROP CONSTRAINT rather than
-- DROP INDEX. We keep the original auto-named constraint
-- candidate_answers_candidate_id_question_id_key and drop the later duplicate added in
-- migration 20251221174736. ON CONFLICT (candidate_id, question_id) upserts are inferred
-- from columns and continue to work against the retained constraint.
ALTER TABLE public.candidate_answers
  DROP CONSTRAINT IF EXISTS candidate_answers_candidate_question_unique;

-- committee_aliases: two identical GIN indexes on fec_committee_ids; neither backs a
-- constraint. Keep idx_committee_aliases_fec_ids_gin, drop the redundant copy created in
-- migration 20260525183805.
DROP INDEX IF EXISTS public.committee_aliases_fec_ids_idx;
