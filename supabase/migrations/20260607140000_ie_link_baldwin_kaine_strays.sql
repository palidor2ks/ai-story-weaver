-- Link Baldwin's Senate independent expenditures to her existing profile, and
-- reattribute small cross-person mis-codes for Kaine and Trump.
--
-- Tammy Baldwin (candidate B001230) and Tim Kaine (K000384) already have
-- profiles from the legislator pipeline. Kaine's Senate FEC id (S2VA00142) is
-- already aliased, so his IEs link; Baldwin's profile was only aliased to her
-- OLD House id (H8WI00018), so the ~$60M of IEs under her Senate id S2WI00219
-- were left unattributed. We add the missing alias (the idiomatic fec -> canonical
-- mapping the importer consults) and backfill the existing rows.
--
-- Three filings are coded to the WRONG candidate's FEC id; those can't go in the
-- alias table (the id belongs to someone else) so they use ie_target_overrides:
--   * BALDWIN named under S4MD00327 (Alsobrooks) -> Baldwin
--   * KAINE   named under S6PA00217 (Casey)      -> Kaine
--   * TRUMP   named under P80000722 (Biden)       -> Trump (P80001571)

-- 1) Missing alias: Baldwin's Senate FEC id -> her canonical candidate.
INSERT INTO public.candidate_fec_ids
  (candidate_id, fec_candidate_id, office, state, is_primary, cycle, match_method)
SELECT 'B001230', 'S2WI00219', 'Senate', 'WI', false, '2024', 'manual'
WHERE NOT EXISTS (
  SELECT 1 FROM public.candidate_fec_ids
  WHERE candidate_id = 'B001230' AND fec_candidate_id = 'S2WI00219'
);

-- 2) Backfill Baldwin's correctly-coded Senate IEs (guarded; idempotent).
DO $$
BEGIN
  IF to_regclass('public.independent_expenditures') IS NOT NULL THEN
    UPDATE public.independent_expenditures
    SET candidate_id = 'B001230'
    WHERE target_fec_candidate_id = 'S2WI00219'
      AND candidate_id IS DISTINCT FROM 'B001230';
  END IF;
END $$;

-- 3) Override rules for the cross-person mis-codes.
INSERT INTO public.ie_target_overrides (
  match_target_fec_candidate_id, match_name_pattern,
  corrected_candidate_id, corrected_target_fec_candidate_id, corrected_target_candidate_name, note
)
SELECT v.fec, v.pat, v.cand, v.ctf, v.cname, v.note
FROM (VALUES
  ('S4MD00327', 'baldwin', 'B001230', 'S2WI00219', 'BALDWIN, TAMMY',
   'Pro-Baldwin IE mis-coded to Alsobrooks'' candidate id S4MD00327.'),
  ('S6PA00217', 'kaine',   'K000384', 'S2VA00142', 'KAINE, TIM',
   'Pro-Kaine IE mis-coded to Casey''s candidate id S6PA00217.'),
  ('P80000722', 'trump',   'P80001571', 'P80001571', 'TRUMP, DONALD',
   'Trump-named IE mis-coded to Biden''s candidate id P80000722.')
) AS v(fec, pat, cand, ctf, cname, note)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ie_target_overrides o
  WHERE o.match_target_fec_candidate_id = v.fec AND o.match_name_pattern = v.pat
);

-- 4) Backfill existing rows from the override rules (guarded; idempotent).
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
