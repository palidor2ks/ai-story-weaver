-- Link Ron DeSantis's independent expenditures to his profile.
--
-- DeSantis withdrew from the 2024 presidential primary, so the active-candidate
-- sweep (discover-fec-candidates, candidate_status=C) never onboarded him even
-- though ~$40M of IEs are coded to his presidential FEC id P40013039. He is
-- onboarded through the candidate funnel by the onboard-fec-candidate function
-- (invoked with {"fec_ids":["P40013039"]}), which also records the
-- candidate_fec_ids alias. This migration does the IE-side wiring and the one
-- cross-person mis-code, guarded so it is a safe no-op anywhere the candidate
-- has not been onboarded yet.

-- Ensure the alias exists (idempotent; only when the candidate is present so the
-- candidate_fec_ids FK is satisfied).
INSERT INTO public.candidate_fec_ids
  (candidate_id, fec_candidate_id, office, state, is_primary, cycle, match_method)
SELECT 'P40013039', 'P40013039', 'President', 'US', true, '2024', 'targeted'
WHERE EXISTS (SELECT 1 FROM public.candidates WHERE id = 'P40013039')
  AND NOT EXISTS (
    SELECT 1 FROM public.candidate_fec_ids
    WHERE candidate_id = 'P40013039' AND fec_candidate_id = 'P40013039'
  );

-- Backfill correctly-coded DeSantis IEs (guarded by candidate existence so the
-- independent_expenditures.candidate_id FK is satisfied; idempotent).
DO $$
BEGIN
  IF to_regclass('public.independent_expenditures') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.candidates WHERE id = 'P40013039') THEN
    UPDATE public.independent_expenditures
    SET candidate_id = 'P40013039'
    WHERE target_fec_candidate_id = 'P40013039'
      AND candidate_id IS DISTINCT FROM 'P40013039';
  END IF;
END $$;

-- Cross-person mis-code: DeSantis-named filing coded to Haley's id P40010977.
INSERT INTO public.ie_target_overrides (
  match_target_fec_candidate_id, match_name_pattern,
  corrected_candidate_id, corrected_target_fec_candidate_id, corrected_target_candidate_name, note
)
SELECT 'P40010977', 'desantis', 'P40013039', 'P40013039', 'DESANTIS, RON',
  'Pro-DeSantis IE mis-coded to Haley''s candidate id P40010977.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ie_target_overrides
  WHERE match_target_fec_candidate_id = 'P40010977' AND match_name_pattern = 'desantis'
);

-- Override-driven backfill. The EXISTS(candidates) guard makes every override
-- self-protecting: a row is only reattributed to a candidate that actually
-- exists, so this stays safe even before a target candidate is onboarded.
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
    WHERE EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = o.corrected_candidate_id)
      AND (o.spending_committee_fec_id IS NULL
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
