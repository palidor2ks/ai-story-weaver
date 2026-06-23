-- Fix: answer_audit_detect() compared candidates.party (an enum, party_type) with ILIKE, which
-- only works on text — so the function errored at runtime ("operator does not exist: party_type
-- ~~* unknown") the moment the kill-switch was flipped on. The bug never surfaced before because
-- the function no-ops while disabled, and the preview branch never ran it. CREATE OR REPLACE with
-- an explicit ::text cast on the party comparisons. (This is a new migration rather than an edit
-- to 20260620230000 so already-migrated databases pick the fix up.)
CREATE OR REPLACE FUNCTION public.answer_audit_detect()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
BEGIN
  SELECT coalesce((stat_value->>'enabled')::boolean, false) INTO v_enabled
    FROM public.admin_stats_cache WHERE stat_key = 'answer_audit_enabled';
  IF NOT coalesce(v_enabled, false) THEN RETURN; END IF;

  INSERT INTO public.answer_source_audit (candidate_id, question_id, answer_value, verdict)
  SELECT ca.candidate_id, ca.question_id, ca.answer_value, 'pending'
  FROM public.candidate_answers ca
  JOIN public.candidates c ON c.id = ca.candidate_id
  WHERE
    -- CITED answers only: a real source_url, a non-empty source_urls element, or a vote label.
    (
      ca.evidence_type = 'voting_record' OR ca.source_type = 'voting_record'
      OR (ca.source_url IS NOT NULL AND length(trim(ca.source_url)) > 0)
      OR (ca.source_urls IS NOT NULL AND EXISTS (
           SELECT 1 FROM unnest(ca.source_urls) u WHERE u IS NOT NULL AND length(trim(u)) > 0))
    )
    -- Party-opposite direction. party is the party_type enum, so cast to text for ILIKE.
    AND (
      (c.party::text ILIKE 'Republican%' AND ca.answer_value <= -3)
      OR (c.party::text ILIKE 'Democrat%'  AND ca.answer_value >= 3)
    )
    AND c.office NOT ILIKE '%U.S. House%'
    AND c.office NOT ILIKE '%U.S. Senate%'
    AND c.office NOT ILIKE '%President%'
    AND c.office NOT ILIKE 'Representative'
    AND c.office NOT ILIKE 'Senator'
    AND (upper(coalesce(c.state, '')) IN ('', 'US')
         OR upper(coalesce(c.state, '')) NOT IN (SELECT upper(state_code) FROM public.hidden_states))
    AND NOT EXISTS (
      SELECT 1 FROM public.answer_source_audit a
      WHERE a.candidate_id = ca.candidate_id AND a.question_id = ca.question_id)
  ORDER BY ca.candidate_id, ca.question_id
  LIMIT 300
  ON CONFLICT (candidate_id, question_id) DO NOTHING;
END $$;
