
CREATE OR REPLACE FUNCTION public.normalize_office_key(_office text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  WITH s0 AS (SELECT lower(coalesce(_office, '')) AS t),
       s1 AS (SELECT regexp_replace(t, '\([^)]*\)', '', 'g') AS t FROM s0),
       s2 AS (SELECT regexp_replace(t, '\s+of\s+the\s+united\s+states', '', 'g') AS t FROM s1),
       s3 AS (SELECT regexp_replace(t, '\mward\s*\d+\M', 'ward', 'g') AS t FROM s2),
       s4 AS (SELECT regexp_replace(t, '\mdistrict\s*\d+\M', 'district', 'g') AS t FROM s3),
       s5 AS (SELECT regexp_replace(t, '\mat[-\s]?large\M', 'atlarge', 'g') AS t FROM s4),
       s6 AS (SELECT regexp_replace(t, '\m(ward|town|city|borough|village|township)\s+council\s+member\M', 'council member', 'g') AS t FROM s5),
       s7 AS (SELECT regexp_replace(t, '[,.]', ' ', 'g') AS t FROM s6),
       s8 AS (SELECT regexp_replace(t, '\s+', ' ', 'g') AS t FROM s7)
  SELECT trim(t) FROM s8
$$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, name, state, office, fec_candidate_id FROM public.candidates LOOP
    UPDATE public.candidates
       SET person_id = public.resolve_person(r.name, r.state, r.office, NULL, r.fec_candidate_id, NULL)
     WHERE id = r.id;
  END LOOP;
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, name, state, office FROM public.static_officials LOOP
    UPDATE public.static_officials
       SET person_id = public.resolve_person(r.name, r.state, r.office, NULL, NULL, NULL)
     WHERE id = r.id;
  END LOOP;
END $$;

DELETE FROM public.persons p
 WHERE NOT EXISTS (SELECT 1 FROM public.candidates WHERE person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM public.static_officials WHERE person_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM public.election_candidates WHERE person_id = p.id);

CREATE OR REPLACE FUNCTION public.auto_merge_obvious_persons()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  grp record;
  winner uuid;
  loser_row record;
  merged_count integer := 0;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  FOR grp IN
    SELECT normalized_name, state
      FROM public.persons
     WHERE normalized_name <> ''
     GROUP BY normalized_name, state
    HAVING count(*) > 1
  LOOP
    SELECT p.id INTO winner
      FROM public.persons p
     WHERE p.normalized_name = grp.normalized_name
       AND coalesce(p.state,'') = coalesce(grp.state,'')
     ORDER BY
       (p.bioguide_id IS NOT NULL) DESC,
       (p.fec_candidate_id IS NOT NULL) DESC,
       (p.openstates_id IS NOT NULL) DESC,
       (EXISTS (SELECT 1 FROM public.static_officials so WHERE so.person_id = p.id)) DESC,
       p.created_at ASC
     LIMIT 1;

    FOR loser_row IN
      SELECT p.id, p.bioguide_id, p.fec_candidate_id, p.openstates_id
        FROM public.persons p
       WHERE p.normalized_name = grp.normalized_name
         AND coalesce(p.state,'') = coalesce(grp.state,'')
         AND p.id <> winner
    LOOP
      UPDATE public.candidates          SET person_id = winner WHERE person_id = loser_row.id;
      UPDATE public.static_officials    SET person_id = winner WHERE person_id = loser_row.id;
      UPDATE public.election_candidates SET person_id = winner WHERE person_id = loser_row.id;

      UPDATE public.persons SET
        bioguide_id      = coalesce(bioguide_id,      loser_row.bioguide_id),
        fec_candidate_id = coalesce(fec_candidate_id, loser_row.fec_candidate_id),
        openstates_id    = coalesce(openstates_id,    loser_row.openstates_id),
        updated_at = now()
       WHERE id = winner;

      DELETE FROM public.persons WHERE id = loser_row.id;
      merged_count := merged_count + 1;
    END LOOP;
  END LOOP;

  RETURN merged_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_merge_obvious_persons() TO authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_redundant_ai_candidates()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count integer := 0;
  r record;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  FOR r IN
    SELECT c.id
      FROM public.candidates c
     WHERE (c.id LIKE 'ai_%' OR c.id LIKE 'civic_%')
       AND c.fec_candidate_id IS NULL
       AND c.person_id IS NOT NULL
       AND c.claimed_by_user_id IS NULL
       AND EXISTS (
         SELECT 1 FROM public.static_officials so WHERE so.person_id = c.person_id
       )
       AND NOT EXISTS (SELECT 1 FROM public.candidate_answers   WHERE candidate_id = c.id)
       AND NOT EXISTS (SELECT 1 FROM public.candidate_votes     WHERE candidate_id = c.id)
       AND NOT EXISTS (SELECT 1 FROM public.candidate_overrides WHERE candidate_id = c.id)
  LOOP
    DELETE FROM public.election_candidates WHERE candidate_id = r.id;
    DELETE FROM public.candidates WHERE id = r.id;
    deleted_count := deleted_count + 1;
  END LOOP;

  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_redundant_ai_candidates() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_roster_row(_source text, _id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF _source = 'candidates' THEN
    DELETE FROM public.election_candidates WHERE candidate_id = _id;
    DELETE FROM public.candidates WHERE id = _id;
  ELSIF _source = 'static_officials' THEN
    DELETE FROM public.static_officials WHERE id = _id;
  ELSIF _source = 'election_candidates' THEN
    DELETE FROM public.election_candidates WHERE id = _id::uuid;
  ELSE
    RAISE EXCEPTION 'unknown source %', _source;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_roster_row(text, text) TO authenticated;
