-- Reattribute pro-Harris independent expenditures coded to shared FEC candidate
-- IDs, chiefly Biden's P80000722.
--
-- FEC reuses one candidate/committee ID across people and elections. The "Biden
-- for President" id P80000722 carried over to the 2024 Biden -> Harris ticket
-- after Biden withdrew (2024-07-21), so the bulk of pro-Harris spending in that
-- cycle is coded to it and currently attributes to Biden's candidate record.
--
-- The split is clean by filer name: HARRIS-named filings under P80000722 are
-- Harris ($283M, almost entirely after the withdrawal); BIDEN-named filings are
-- legitimate primary/2020 spending that must stay with Biden. The exact-name
-- override from the previous migration can't catch the many Harris spelling
-- variants/typos (HARRIS, KAMALA D. / KAMALA, HARRIS / HARRIS, KAMELA / KAMAL),
-- so we add case-insensitive regex matching and a rule scoped to the specific
-- mis-coded FEC id (so a loose name pattern cannot match an unrelated person).

ALTER TABLE public.ie_target_overrides
  ADD COLUMN IF NOT EXISTS match_name_pattern text;

COMMENT ON COLUMN public.ie_target_overrides.match_name_pattern IS
  'Optional case-insensitive POSIX regex (~*) matched against target_candidate_name, for filer name variants/typos. ANDed with the other match_* columns; always pair with a specific match_target_fec_candidate_id so the pattern cannot match an unrelated person.';

-- Rule 1: pro-Harris IEs coded to Biden's inherited committee id P80000722
-- (any committee, any cycle) -> Harris (P00009423).
INSERT INTO public.ie_target_overrides (
  spending_committee_fec_id, match_cycle, match_target_fec_candidate_id,
  match_name_pattern, corrected_candidate_id, corrected_target_fec_candidate_id,
  corrected_target_candidate_name, note
)
SELECT
  NULL, NULL, 'P80000722',
  '(harr.*kam|kam.*harr|kamal|kamel)', 'P00009423', 'P00009423', 'HARRIS, KAMALA',
  'Pro-Harris IEs coded to Biden''s inherited committee id P80000722 (2024 Biden->Harris ticket).'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ie_target_overrides
  WHERE match_target_fec_candidate_id = 'P80000722'
    AND match_name_pattern = '(harr.*kam|kam.*harr|kamal|kamel)'
);

-- Rule 2: Harris/Walz IEs mis-coded to Trump's candidate id P80001571 -> Harris.
INSERT INTO public.ie_target_overrides (
  spending_committee_fec_id, match_cycle, match_target_fec_candidate_id,
  match_name_pattern, corrected_candidate_id, corrected_target_fec_candidate_id,
  corrected_target_candidate_name, note
)
SELECT
  NULL, NULL, 'P80001571',
  '(harr.*kam|kam.*harr|harris/walz)', 'P00009423', 'P00009423', 'HARRIS, KAMALA',
  'Pro-Harris IEs mis-coded to Trump''s candidate id P80001571.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ie_target_overrides
  WHERE match_target_fec_candidate_id = 'P80001571'
    AND match_name_pattern = '(harr.*kam|kam.*harr|harris/walz)'
);

-- Backfill existing rows. Guarded so this is a safe no-op where the IE table is
-- absent; idempotent via the trailing change-detection predicate.
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
      AND (o.match_name_pattern IS NULL
             OR ie.target_candidate_name ~* o.match_name_pattern)
      AND (
        ie.candidate_id IS DISTINCT FROM o.corrected_candidate_id
        OR ie.target_fec_candidate_id IS DISTINCT FROM
             COALESCE(o.corrected_target_fec_candidate_id, ie.target_fec_candidate_id)
      );
  END IF;
END $$;
