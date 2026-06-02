-- Helpers
CREATE OR REPLACE FUNCTION public._candidate_name_key(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT (
    SELECT string_agg(tok, ' ' ORDER BY tok)
    FROM unnest(string_to_array(
      regexp_replace(lower(regexp_replace(coalesce(p_name,''), '[,.]', '', 'g')), '\s+', ' ', 'g'),
      ' '
    )) AS tok
    WHERE tok <> '' AND tok NOT IN ('jr','sr','ii','iii','iv','mr','mrs','ms','dr')
  );
$$;

CREATE OR REPLACE FUNCTION public._candidate_district_key(p_district text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_district IS NULL OR p_district = '' THEN NULL ELSE ltrim(p_district, '0') END;
$$;

CREATE OR REPLACE FUNCTION public._candidate_office_class(p_office text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_office IS NULL THEN 'other'
    WHEN lower(p_office) ~ 'senator|u\.s\. senate|us senate' THEN 'senate'
    WHEN lower(p_office) ~ 'representative|u\.s\. house|us house|congress' THEN 'house'
    WHEN lower(p_office) ~ 'president' THEN 'president'
    WHEN lower(p_office) ~ 'governor' THEN 'governor'
    ELSE lower(p_office)
  END;
$$;

CREATE OR REPLACE FUNCTION public._merge_candidate(p_loser text, p_winner text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_loser = p_winner THEN RETURN; END IF;

  DELETE FROM candidate_answers a WHERE a.candidate_id = p_loser
    AND EXISTS (SELECT 1 FROM candidate_answers w WHERE w.candidate_id = p_winner AND w.question_id = a.question_id);
  UPDATE candidate_answers SET candidate_id = p_winner WHERE candidate_id = p_loser;

  DELETE FROM candidate_votes v WHERE v.candidate_id = p_loser
    AND EXISTS (SELECT 1 FROM candidate_votes w WHERE w.candidate_id = p_winner
                  AND w.bill_id = v.bill_id AND w.action_type = v.action_type AND w.vote_number = v.vote_number);
  UPDATE candidate_votes SET candidate_id = p_winner WHERE candidate_id = p_loser;

  DELETE FROM candidate_committees c WHERE c.candidate_id = p_loser
    AND EXISTS (SELECT 1 FROM candidate_committees w WHERE w.candidate_id = p_winner AND w.fec_committee_id = c.fec_committee_id);
  UPDATE candidate_committees SET candidate_id = p_winner WHERE candidate_id = p_loser;

  DELETE FROM candidate_fec_ids f WHERE f.candidate_id = p_loser
    AND EXISTS (SELECT 1 FROM candidate_fec_ids w WHERE w.candidate_id = p_winner AND w.fec_candidate_id = f.fec_candidate_id);
  UPDATE candidate_fec_ids SET candidate_id = p_winner WHERE candidate_id = p_loser;

  DELETE FROM candidate_overrides o WHERE o.candidate_id = p_loser
    AND EXISTS (SELECT 1 FROM candidate_overrides w WHERE w.candidate_id = p_winner);
  UPDATE candidate_overrides SET candidate_id = p_winner WHERE candidate_id = p_loser;

  DELETE FROM candidate_topic_scores t WHERE t.candidate_id = p_loser
    AND EXISTS (SELECT 1 FROM candidate_topic_scores w WHERE w.candidate_id = p_winner AND w.topic_id = t.topic_id);
  UPDATE candidate_topic_scores SET candidate_id = p_winner WHERE candidate_id = p_loser;

  DELETE FROM finance_reconciliation r WHERE r.candidate_id = p_loser
    AND EXISTS (SELECT 1 FROM finance_reconciliation w WHERE w.candidate_id = p_winner AND w.cycle = r.cycle);
  UPDATE finance_reconciliation SET candidate_id = p_winner WHERE candidate_id = p_loser;

  IF to_regclass('public.pac_candidate_totals') IS NOT NULL THEN
    EXECUTE '
      DELETE FROM public.pac_candidate_totals p WHERE p.candidate_id = $1
        AND EXISTS (SELECT 1 FROM public.pac_candidate_totals w WHERE w.candidate_id = $2
                      AND w.committee_id = p.committee_id AND w.cycle = p.cycle)'
      USING p_loser, p_winner;
    EXECUTE 'UPDATE public.pac_candidate_totals SET candidate_id = $1 WHERE candidate_id = $2'
      USING p_winner, p_loser;
  END IF;

  IF to_regclass('public.pac_expenditures') IS NOT NULL THEN
    EXECUTE '
      DELETE FROM public.pac_expenditures e WHERE e.candidate_id = $1
        AND EXISTS (SELECT 1 FROM public.pac_expenditures w WHERE w.candidate_id = $2
                      AND w.committee_id = e.committee_id AND w.support_oppose = e.support_oppose AND w.cycle = e.cycle)'
      USING p_loser, p_winner;
    EXECUTE 'UPDATE public.pac_expenditures SET candidate_id = $1 WHERE candidate_id = $2'
      USING p_winner, p_loser;
  END IF;

  DELETE FROM election_candidates ec WHERE ec.candidate_id = p_loser
    AND EXISTS (SELECT 1 FROM election_candidates w WHERE w.candidate_id = p_winner AND w.election_id = ec.election_id);
  UPDATE election_candidates SET candidate_id = p_winner WHERE candidate_id = p_loser;

  DELETE FROM profile_claims pc WHERE pc.candidate_id = p_loser
    AND EXISTS (SELECT 1 FROM profile_claims w WHERE w.candidate_id = p_winner AND w.user_id = pc.user_id);
  UPDATE profile_claims SET candidate_id = p_winner WHERE candidate_id = p_loser;

  UPDATE donors                     SET candidate_id           = p_winner WHERE candidate_id = p_loser;
  UPDATE committee_finance_rollups  SET candidate_id           = p_winner WHERE candidate_id = p_loser;
  UPDATE external_committee_finance SET candidate_id           = p_winner WHERE candidate_id = p_loser;
  UPDATE contributions              SET candidate_id           = p_winner WHERE candidate_id = p_loser;
  UPDATE mayor_fetch_queue          SET resulting_candidate_id = p_winner WHERE resulting_candidate_id = p_loser;

  UPDATE candidates w
     SET fec_candidate_id   = COALESCE(w.fec_candidate_id, l.fec_candidate_id),
         fec_committee_id   = COALESCE(w.fec_committee_id, l.fec_committee_id),
         lis_member_id      = COALESCE(w.lis_member_id, l.lis_member_id),
         image_url          = COALESCE(w.image_url, l.image_url),
         district           = COALESCE(w.district, l.district)
    FROM candidates l
   WHERE w.id = p_winner AND l.id = p_loser;

  DELETE FROM candidates WHERE id = p_loser;
  PERFORM recalculate_candidate_coverage(p_winner);
END;
$$;

-- Run merges with the politician-protection triggers temporarily off.
ALTER TABLE candidate_answers   DISABLE TRIGGER prevent_politician_score_tampering_trigger;
ALTER TABLE candidate_overrides DISABLE TRIGGER prevent_candidate_override_tampering_trg;
ALTER TABLE candidate_overrides DISABLE TRIGGER trg_prevent_politician_sensitive_override_changes;

SELECT _merge_candidate('H8NJ03073', 'P000034');
SELECT _merge_candidate('S2MT00096', 'D000618');
SELECT _merge_candidate('H4MT01041', 'Z000018');
SELECT _merge_candidate('S6IA00314', 'H0IA01174');

ALTER TABLE candidate_answers   ENABLE TRIGGER prevent_politician_score_tampering_trigger;
ALTER TABLE candidate_overrides ENABLE TRIGGER prevent_candidate_override_tampering_trg;
ALTER TABLE candidate_overrides ENABLE TRIGGER trg_prevent_politician_sensitive_override_changes;

-- Backfill canonical FEC ids
UPDATE candidates c
   SET fec_candidate_id = f.fec_candidate_id
  FROM candidate_fec_ids f
 WHERE f.candidate_id = c.id
   AND f.is_primary = true
   AND (c.fec_candidate_id IS NULL OR c.fec_candidate_id <> f.fec_candidate_id);

-- Duplicate prevention trigger
CREATE OR REPLACE FUNCTION public.prevent_duplicate_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing_id text;
  v_new_key  text;
  v_new_dist text;
  v_new_class text;
BEGIN
  IF current_setting('app.allow_duplicate_candidate', true) = 'on' THEN
    RETURN NEW;
  END IF;
  v_new_key  := _candidate_name_key(NEW.name);
  v_new_dist := _candidate_district_key(NEW.district);
  v_new_class := _candidate_office_class(NEW.office);
  IF v_new_key IS NULL OR v_new_key = '' THEN RETURN NEW; END IF;

  SELECT c.id INTO v_existing_id
    FROM candidates c
   WHERE c.id <> NEW.id
     AND _candidate_name_key(c.name) = v_new_key
     AND COALESCE(c.state,'') = COALESCE(NEW.state,'')
     AND _candidate_office_class(c.office) = v_new_class
     AND (
       _candidate_district_key(c.district) IS NULL
       OR v_new_dist IS NULL
       OR _candidate_district_key(c.district) = v_new_dist
     )
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate_candidate: id=% matches existing candidate id=%', NEW.id, v_existing_id
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_duplicate_candidate_trg ON public.candidates;
CREATE TRIGGER prevent_duplicate_candidate_trg
  BEFORE INSERT ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_candidate();