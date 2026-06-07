-- Independent-expenditure target corrections.
--
-- FEC Schedule E filings are coded by the filer, and the coded target candidate
-- ID is sometimes wrong or missing. A clear example: the Working Families Party
-- PAC (C00606962) spent ~$4M supporting Kamala Harris in the 2024 cycle, but a
-- handful of those filings were coded to the wrong/missing FEC candidate ID --
-- including P80000722, which is actually Joe Biden's presidential committee ID.
-- Those rows surface as separate "HARRIS, KAMALA" recipients.
--
-- We deliberately do NOT remap a shared FEC candidate ID (e.g. P80000722) to
-- Harris globally, because that ID legitimately belongs to Biden everywhere
-- else. Instead we record narrowly-scoped corrections (committee + cycle + filer
-- name) that the importer applies on every sync and that we backfill once here.

CREATE TABLE IF NOT EXISTS public.ie_target_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Match conditions. NULL means "wildcard / any".
  spending_committee_fec_id         text,
  match_cycle                       text,
  match_target_fec_candidate_id     text,
  match_target_candidate_name       text,
  -- Corrected values applied to matching expenditures.
  corrected_candidate_id            text NOT NULL,
  corrected_target_fec_candidate_id text,
  corrected_target_candidate_name   text,
  note                              text,
  created_at                        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ie_target_overrides IS
  'Manual corrections for independent_expenditures whose FEC-coded target candidate is wrong or missing. Applied at import time and by one-time backfill. Scoped by committee/cycle/filer-name so shared FEC candidate IDs are never remapped globally.';

ALTER TABLE public.ie_target_overrides ENABLE ROW LEVEL SECURITY;

-- Admins manage corrections from the app; the importer uses the service role,
-- which bypasses RLS.
DROP POLICY IF EXISTS "ie_target_overrides_admin_all" ON public.ie_target_overrides;
CREATE POLICY "ie_target_overrides_admin_all" ON public.ie_target_overrides
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed: reattribute pro-Harris 2024 IEs by the Working Families Party PAC that
-- were coded to other/missing FEC candidate IDs (P80000722 = Biden, P00004523,
-- and an uncoded filing) to Harris's canonical candidate (P00009423). Matching
-- by filer name within this committee + cycle also harmlessly re-affirms the
-- already-correct P00009423 rows.
INSERT INTO public.ie_target_overrides (
  spending_committee_fec_id, match_cycle, match_target_candidate_name,
  corrected_candidate_id, corrected_target_fec_candidate_id,
  corrected_target_candidate_name, note
)
SELECT
  'C00606962', '2024', 'HARRIS, KAMALA',
  'P00009423', 'P00009423', 'HARRIS, KAMALA',
  'Pro-Harris 2024 independent expenditures mis-coded to wrong/missing FEC candidate IDs (incl. P80000722=Biden).'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ie_target_overrides
  WHERE spending_committee_fec_id = 'C00606962'
    AND match_cycle = '2024'
    AND match_target_candidate_name = 'HARRIS, KAMALA'
);

-- One-time backfill of existing rows. Guarded so this migration is a safe no-op
-- in environments that don't have the independent_expenditures table.
DO $$
BEGIN
  IF to_regclass('public.independent_expenditures') IS NOT NULL THEN
    UPDATE public.independent_expenditures AS ie
    SET candidate_id = o.corrected_candidate_id,
        target_fec_candidate_id =
          COALESCE(o.corrected_target_fec_candidate_id, ie.target_fec_candidate_id),
        target_candidate_name =
          COALESCE(o.corrected_target_candidate_name, ie.target_candidate_name)
    FROM public.ie_target_overrides AS o
    WHERE (o.spending_committee_fec_id IS NULL
             OR o.spending_committee_fec_id = ie.spending_committee_fec_id)
      AND (o.match_cycle IS NULL OR o.match_cycle = ie.cycle)
      AND (o.match_target_fec_candidate_id IS NULL
             OR o.match_target_fec_candidate_id = ie.target_fec_candidate_id)
      AND (o.match_target_candidate_name IS NULL
             OR upper(btrim(o.match_target_candidate_name)) = upper(btrim(ie.target_candidate_name)))
      -- Only touch rows that actually need correcting (idempotent re-runs).
      AND (
        ie.candidate_id IS DISTINCT FROM o.corrected_candidate_id
        OR ie.target_fec_candidate_id IS DISTINCT FROM
             COALESCE(o.corrected_target_fec_candidate_id, ie.target_fec_candidate_id)
      );
  END IF;
END $$;
