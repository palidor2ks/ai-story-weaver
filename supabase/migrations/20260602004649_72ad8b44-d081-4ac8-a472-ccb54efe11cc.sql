
-- 1. Normalization helper
CREATE OR REPLACE FUNCTION public.normalize_person_name(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT trim(regexp_replace(
    regexp_replace(
      regexp_replace(lower(coalesce(_name, '')), '\m[a-z]\.\s*', '', 'g'),
      '[^a-z ]', '', 'g'
    ),
    '\s+', ' ', 'g'
  ))
$$;

CREATE OR REPLACE FUNCTION public.normalize_office_key(_office text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT trim(regexp_replace(
    regexp_replace(lower(coalesce(_office, '')), '\s+of\s+the\s+united\s+states', '', 'g'),
    '\s+', ' ', 'g'
  ))
$$;

-- 2. Canonical persons table
CREATE TABLE public.persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  normalized_name text GENERATED ALWAYS AS (public.normalize_person_name(display_name)) STORED,
  state text,
  office_key text,
  bioguide_id text,
  fec_candidate_id text,
  openstates_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.persons TO anon, authenticated;
GRANT ALL ON public.persons TO service_role;

ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Persons are viewable by everyone"
  ON public.persons FOR SELECT USING (true);

CREATE POLICY "Admins manage persons"
  ON public.persons FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages persons"
  ON public.persons FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Unique constraints (partial so nulls don't collide)
CREATE UNIQUE INDEX persons_bioguide_uq
  ON public.persons (bioguide_id) WHERE bioguide_id IS NOT NULL;
CREATE UNIQUE INDEX persons_fec_uq
  ON public.persons (fec_candidate_id) WHERE fec_candidate_id IS NOT NULL;
CREATE UNIQUE INDEX persons_openstates_uq
  ON public.persons (openstates_id) WHERE openstates_id IS NOT NULL;
CREATE UNIQUE INDEX persons_name_state_office_uq
  ON public.persons (normalized_name, coalesce(state, ''), coalesce(office_key, ''));

-- 3. Resolver: find-or-create a persons row
CREATE OR REPLACE FUNCTION public.resolve_person(
  _name text,
  _state text,
  _office text,
  _bioguide_id text DEFAULT NULL,
  _fec_candidate_id text DEFAULT NULL,
  _openstates_id text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pid uuid;
  _norm text := public.normalize_person_name(_name);
  _okey text := public.normalize_office_key(_office);
BEGIN
  IF _norm IS NULL OR _norm = '' THEN
    RETURN NULL;
  END IF;

  -- Strong-ID matches win
  IF _bioguide_id IS NOT NULL THEN
    SELECT id INTO _pid FROM public.persons WHERE bioguide_id = _bioguide_id LIMIT 1;
    IF _pid IS NOT NULL THEN RETURN _pid; END IF;
  END IF;
  IF _fec_candidate_id IS NOT NULL THEN
    SELECT id INTO _pid FROM public.persons WHERE fec_candidate_id = _fec_candidate_id LIMIT 1;
    IF _pid IS NOT NULL THEN RETURN _pid; END IF;
  END IF;
  IF _openstates_id IS NOT NULL THEN
    SELECT id INTO _pid FROM public.persons WHERE openstates_id = _openstates_id LIMIT 1;
    IF _pid IS NOT NULL THEN RETURN _pid; END IF;
  END IF;

  -- Name+state+office match
  SELECT id INTO _pid FROM public.persons
   WHERE normalized_name = _norm
     AND coalesce(state, '') = coalesce(_state, '')
     AND coalesce(office_key, '') = coalesce(_okey, '')
   LIMIT 1;

  IF _pid IS NOT NULL THEN
    -- Backfill any missing strong IDs
    UPDATE public.persons SET
      bioguide_id = coalesce(bioguide_id, _bioguide_id),
      fec_candidate_id = coalesce(fec_candidate_id, _fec_candidate_id),
      openstates_id = coalesce(openstates_id, _openstates_id),
      updated_at = now()
     WHERE id = _pid;
    RETURN _pid;
  END IF;

  INSERT INTO public.persons (display_name, state, office_key, bioguide_id, fec_candidate_id, openstates_id)
  VALUES (_name, _state, _okey, _bioguide_id, _fec_candidate_id, _openstates_id)
  RETURNING id INTO _pid;

  RETURN _pid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_person(text, text, text, text, text, text) TO authenticated, service_role;

-- 4. Add person_id to source tables
ALTER TABLE public.candidates        ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL;
ALTER TABLE public.static_officials  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL;
ALTER TABLE public.election_candidates ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS candidates_person_id_idx        ON public.candidates(person_id);
CREATE INDEX IF NOT EXISTS static_officials_person_id_idx  ON public.static_officials(person_id);
CREATE INDEX IF NOT EXISTS election_candidates_person_id_idx ON public.election_candidates(person_id);

-- 5. Backfill
UPDATE public.candidates c
   SET person_id = public.resolve_person(c.name, c.state, c.office, NULL, c.fec_candidate_id, NULL)
 WHERE c.person_id IS NULL;

UPDATE public.static_officials s
   SET person_id = public.resolve_person(s.name, s.state, s.office, NULL, NULL, NULL)
 WHERE s.person_id IS NULL;

UPDATE public.election_candidates e
   SET person_id = public.resolve_person(
         (SELECT name FROM public.candidates WHERE id = e.candidate_id),
         (SELECT state FROM public.candidates WHERE id = e.candidate_id),
         e.office, NULL, NULL, NULL)
 WHERE e.person_id IS NULL;

-- 6. Triggers to auto-resolve on insert/update
CREATE OR REPLACE FUNCTION public.tg_resolve_person_candidates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.person_id IS NULL THEN
    NEW.person_id := public.resolve_person(NEW.name, NEW.state, NEW.office, NULL, NEW.fec_candidate_id, NULL);
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.tg_resolve_person_static_officials()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.person_id IS NULL THEN
    NEW.person_id := public.resolve_person(NEW.name, NEW.state, NEW.office, NULL, NULL, NULL);
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.tg_resolve_person_election_candidates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _name text; _state text;
BEGIN
  IF NEW.person_id IS NULL THEN
    SELECT name, state INTO _name, _state FROM public.candidates WHERE id = NEW.candidate_id;
    NEW.person_id := public.resolve_person(_name, _state, NEW.office, NULL, NULL, NULL);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS resolve_person_candidates ON public.candidates;
CREATE TRIGGER resolve_person_candidates
  BEFORE INSERT OR UPDATE OF name, state, office, fec_candidate_id ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.tg_resolve_person_candidates();

DROP TRIGGER IF EXISTS resolve_person_static_officials ON public.static_officials;
CREATE TRIGGER resolve_person_static_officials
  BEFORE INSERT OR UPDATE OF name, state, office ON public.static_officials
  FOR EACH ROW EXECUTE FUNCTION public.tg_resolve_person_static_officials();

DROP TRIGGER IF EXISTS resolve_person_election_candidates ON public.election_candidates;
CREATE TRIGGER resolve_person_election_candidates
  BEFORE INSERT OR UPDATE OF candidate_id, office ON public.election_candidates
  FOR EACH ROW EXECUTE FUNCTION public.tg_resolve_person_election_candidates();

-- 7. Admin merge RPC: collapse `from_id` into `into_id`
CREATE OR REPLACE FUNCTION public.merge_persons(into_id uuid, from_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF into_id = from_id THEN RETURN; END IF;

  UPDATE public.candidates          SET person_id = into_id WHERE person_id = from_id;
  UPDATE public.static_officials    SET person_id = into_id WHERE person_id = from_id;
  UPDATE public.election_candidates SET person_id = into_id WHERE person_id = from_id;

  UPDATE public.persons p SET
    bioguide_id      = coalesce(p.bioguide_id,      (SELECT bioguide_id      FROM public.persons WHERE id = from_id)),
    fec_candidate_id = coalesce(p.fec_candidate_id, (SELECT fec_candidate_id FROM public.persons WHERE id = from_id)),
    openstates_id    = coalesce(p.openstates_id,    (SELECT openstates_id    FROM public.persons WHERE id = from_id)),
    updated_at = now()
   WHERE p.id = into_id;

  DELETE FROM public.persons WHERE id = from_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_persons(uuid, uuid) TO authenticated;
