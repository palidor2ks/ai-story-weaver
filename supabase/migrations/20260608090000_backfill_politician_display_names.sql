-- Backfill politician display names to match the UI formatter introduced in
-- src/lib/nameFormat.ts: "First M. Last" with no all-caps or last-name-first
-- presentation.
--
-- Scope:
--   * candidates.name
--   * static_officials.name
--   * candidate_overrides.name (when present)
--   * persons.display_name (only when the generated normalized_name uniqueness
--     constraint would not collide)
--
-- An audit table records every proposed/applied change so the backfill is
-- reviewable after migration. Helper functions are intentionally temporary to
-- this migration and are dropped at the end.

CREATE TABLE IF NOT EXISTS public.person_name_backfill_audit (
  id bigserial PRIMARY KEY,
  source_table text NOT NULL,
  source_id text NOT NULL,
  old_name text NOT NULL,
  new_name text NOT NULL,
  status text NOT NULL DEFAULT 'applied',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS person_name_backfill_audit_once_idx
  ON public.person_name_backfill_audit (source_table, source_id, old_name, new_name, status);

ALTER TABLE public.person_name_backfill_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view person name backfill audit"
  ON public.person_name_backfill_audit;
CREATE POLICY "Admins can view person name backfill audit"
  ON public.person_name_backfill_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role manages person name backfill audit"
  ON public.person_name_backfill_audit;
CREATE POLICY "Service role manages person name backfill audit"
  ON public.person_name_backfill_audit FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public._name_backfill_clean_token(token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(coalesce(token, ''), '^\.+|\.+$', '', 'g')
$$;

CREATE OR REPLACE FUNCTION public._name_backfill_is_suffix(token text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(public._name_backfill_clean_token(token)) = ANY (
    ARRAY['jr', 'sr', 'ii', 'iii', 'iv', 'v', 'vi', 'phd', 'ph.d', 'md', 'm.d', 'dds', 'd.d.s', 'esq']
  )
$$;

CREATE OR REPLACE FUNCTION public._name_backfill_format_suffix(token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(public._name_backfill_clean_token(token))
    WHEN 'jr' THEN 'Jr.'
    WHEN 'sr' THEN 'Sr.'
    WHEN 'phd' THEN 'Ph.D.'
    WHEN 'ph.d' THEN 'Ph.D.'
    WHEN 'md' THEN 'M.D.'
    WHEN 'm.d' THEN 'M.D.'
    WHEN 'dds' THEN 'D.D.S.'
    WHEN 'd.d.s' THEN 'D.D.S.'
    WHEN 'esq' THEN 'Esq.'
    ELSE upper(public._name_backfill_clean_token(token))
  END
$$;

CREATE OR REPLACE FUNCTION public._name_backfill_format_initial(token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN public._name_backfill_clean_token(token) = '' THEN ''
    ELSE upper(left(public._name_backfill_clean_token(token), 1)) || '.'
  END
$$;

CREATE OR REPLACE FUNCTION public._name_backfill_format_token(token text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  cleaned text := public._name_backfill_clean_token(token);
  lower_token text := lower(public._name_backfill_clean_token(token));
BEGIN
  IF cleaned = '' THEN
    RETURN '';
  END IF;

  IF public._name_backfill_is_suffix(cleaned) THEN
    RETURN public._name_backfill_format_suffix(cleaned);
  END IF;

  IF cleaned ~* '^[ivxlcdm]+$' AND length(cleaned) <= 6 THEN
    RETURN upper(cleaned);
  END IF;

  IF cleaned ~* '^[a-z]\.?$' THEN
    RETURN upper(left(cleaned, 1)) || '.';
  END IF;

  IF lower_token ~ '^mc[a-z]' THEN
    RETURN 'Mc' || upper(substr(lower_token, 3, 1)) || substr(lower_token, 4);
  END IF;

  IF lower_token ~ '^mac[a-z]' THEN
    RETURN 'Mac' || upper(substr(lower_token, 4, 1)) || substr(lower_token, 5);
  END IF;

  RETURN initcap(lower_token);
END;
$$;

CREATE OR REPLACE FUNCTION public._name_backfill_format_part(part text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  tokens text[];
  token text;
  idx integer := 0;
  out_parts text[] := ARRAY[]::text[];
  particle text;
BEGIN
  tokens := regexp_split_to_array(trim(regexp_replace(coalesce(part, ''), '\s+', ' ', 'g')), '\s+');

  FOREACH token IN ARRAY tokens LOOP
    IF coalesce(token, '') = '' THEN
      CONTINUE;
    END IF;

    idx := idx + 1;
    particle := lower(public._name_backfill_clean_token(token));

    IF idx > 1 AND particle = ANY (ARRAY['de', 'del', 'de la', 'da', 'di', 'du', 'la', 'le', 'van', 'von']) THEN
      out_parts := array_append(out_parts, particle);
    ELSE
      out_parts := array_append(out_parts, public._name_backfill_format_token(token));
    END IF;
  END LOOP;

  RETURN array_to_string(out_parts, ' ');
END;
$$;

CREATE OR REPLACE FUNCTION public._name_backfill_strip_suffixes(tokens text[], OUT body text[], OUT suffixes text[])
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  len integer;
BEGIN
  body := coalesce(tokens, ARRAY[]::text[]);
  suffixes := ARRAY[]::text[];
  len := coalesce(array_length(body, 1), 0);

  WHILE len > 0 AND public._name_backfill_is_suffix(body[len]) LOOP
    suffixes := array_prepend(public._name_backfill_format_suffix(body[len]), suffixes);
    IF len = 1 THEN
      body := ARRAY[]::text[];
    ELSE
      body := body[1:(len - 1)];
    END IF;
    len := coalesce(array_length(body, 1), 0);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public._name_backfill_format_person_name(input_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  raw text := trim(regexp_replace(
    replace(replace(replace(replace(coalesce(input_name, ''), '“', '"'), '”', '"'), '‘', $q$'$q$), '’', $q$'$q$),
    '\s+',
    ' ',
    'g'
  ));
  comma_parts text[];
  tokens text[];
  body text[];
  suffixes text[];
  result_parts text[] := ARRAY[]::text[];
  trailing text;
  len integer;
  i integer;
BEGIN
  IF raw = '' THEN
    RETURN '';
  END IF;

  IF position(',' in raw) > 0 THEN
    comma_parts := regexp_split_to_array(raw, '\s*,\s*');
    tokens := regexp_split_to_array(coalesce(comma_parts[2], ''), '\s+');
    SELECT s.body, s.suffixes INTO body, suffixes
      FROM public._name_backfill_strip_suffixes(tokens) AS s;

    len := coalesce(array_length(body, 1), 0);
    IF len > 0 THEN
      result_parts := array_append(result_parts, public._name_backfill_format_part(body[1]));
      IF len > 1 THEN
        FOR i IN 2..len LOOP
          result_parts := array_append(result_parts, public._name_backfill_format_initial(body[i]));
        END LOOP;
      END IF;
    END IF;

    result_parts := array_append(result_parts, public._name_backfill_format_part(comma_parts[1]));

    IF coalesce(array_length(comma_parts, 1), 0) > 2 THEN
      FOR i IN 3..array_length(comma_parts, 1) LOOP
        trailing := comma_parts[i];
        IF public._name_backfill_is_suffix(trailing) THEN
          suffixes := array_append(suffixes, public._name_backfill_format_suffix(trailing));
        END IF;
      END LOOP;
    END IF;

    RETURN trim(array_to_string(result_parts || suffixes, ' '));
  END IF;

  tokens := regexp_split_to_array(raw, '\s+');
  SELECT s.body, s.suffixes INTO body, suffixes
    FROM public._name_backfill_strip_suffixes(tokens) AS s;

  len := coalesce(array_length(body, 1), 0);
  IF len = 0 THEN
    RETURN trim(array_to_string(suffixes, ' '));
  END IF;

  IF len = 1 THEN
    RETURN trim(array_to_string(ARRAY[public._name_backfill_format_part(body[1])] || suffixes, ' '));
  END IF;

  result_parts := array_append(result_parts, public._name_backfill_format_part(body[1]));
  IF len > 2 THEN
    FOR i IN 2..(len - 1) LOOP
      result_parts := array_append(result_parts, public._name_backfill_format_initial(body[i]));
    END LOOP;
  END IF;
  result_parts := array_append(result_parts, public._name_backfill_format_part(body[len]));

  RETURN trim(array_to_string(result_parts || suffixes, ' '));
END;
$$;

WITH proposed AS (
  SELECT id::text AS source_id, name AS old_name, public._name_backfill_format_person_name(name) AS new_name
  FROM public.candidates
  WHERE name IS NOT NULL
)
INSERT INTO public.person_name_backfill_audit (source_table, source_id, old_name, new_name)
SELECT 'candidates', source_id, old_name, new_name
FROM proposed
WHERE old_name IS DISTINCT FROM new_name
ON CONFLICT DO NOTHING;

WITH proposed AS (
  SELECT id, public._name_backfill_format_person_name(name) AS new_name
  FROM public.candidates
  WHERE name IS NOT NULL
)
UPDATE public.candidates c
SET name = p.new_name
FROM proposed p
WHERE c.id = p.id
  AND c.name IS DISTINCT FROM p.new_name;

WITH proposed AS (
  SELECT id::text AS source_id, name AS old_name, public._name_backfill_format_person_name(name) AS new_name
  FROM public.static_officials
  WHERE name IS NOT NULL
)
INSERT INTO public.person_name_backfill_audit (source_table, source_id, old_name, new_name)
SELECT 'static_officials', source_id, old_name, new_name
FROM proposed
WHERE old_name IS DISTINCT FROM new_name
ON CONFLICT DO NOTHING;

WITH proposed AS (
  SELECT id, public._name_backfill_format_person_name(name) AS new_name
  FROM public.static_officials
  WHERE name IS NOT NULL
)
UPDATE public.static_officials s
SET name = p.new_name,
    updated_at = now()
FROM proposed p
WHERE s.id = p.id
  AND s.name IS DISTINCT FROM p.new_name;

DO $$
BEGIN
  IF to_regclass('public.candidate_overrides') IS NOT NULL THEN
    ALTER TABLE public.candidate_overrides DISABLE TRIGGER USER;
  END IF;
END $$;

WITH proposed AS (
  SELECT candidate_id AS source_id, name AS old_name, public._name_backfill_format_person_name(name) AS new_name
  FROM public.candidate_overrides
  WHERE name IS NOT NULL
)
INSERT INTO public.person_name_backfill_audit (source_table, source_id, old_name, new_name)
SELECT 'candidate_overrides', source_id, old_name, new_name
FROM proposed
WHERE old_name IS DISTINCT FROM new_name
ON CONFLICT DO NOTHING;

WITH proposed AS (
  SELECT candidate_id, public._name_backfill_format_person_name(name) AS new_name
  FROM public.candidate_overrides
  WHERE name IS NOT NULL
)
UPDATE public.candidate_overrides co
SET name = p.new_name,
    updated_at = now()
FROM proposed p
WHERE co.candidate_id = p.candidate_id
  AND co.name IS DISTINCT FROM p.new_name;

DO $$
BEGIN
  IF to_regclass('public.candidate_overrides') IS NOT NULL THEN
    ALTER TABLE public.candidate_overrides ENABLE TRIGGER USER;
  END IF;
END $$;

WITH proposed AS (
  SELECT
    id::text AS source_id,
    display_name AS old_name,
    public._name_backfill_format_person_name(display_name) AS new_name,
    state,
    office_key,
    public.normalize_person_name(public._name_backfill_format_person_name(display_name)) AS new_normalized_name
  FROM public.persons
  WHERE display_name IS NOT NULL
), review AS (
  SELECT p.*,
         EXISTS (
           SELECT 1
           FROM public.persons other
           WHERE other.id::text <> p.source_id
             AND other.normalized_name = p.new_normalized_name
             AND coalesce(other.state, '') = coalesce(p.state, '')
             AND coalesce(other.office_key, '') = coalesce(p.office_key, '')
         ) AS would_collide
  FROM proposed p
  WHERE p.old_name IS DISTINCT FROM p.new_name
)
INSERT INTO public.person_name_backfill_audit (source_table, source_id, old_name, new_name, status, note)
SELECT
  'persons',
  source_id,
  old_name,
  new_name,
  CASE WHEN would_collide THEN 'needs_review' ELSE 'applied' END,
  CASE WHEN would_collide THEN 'Skipped persons.display_name update because it would collide with persons_name_state_office_uq.' END
FROM review
ON CONFLICT DO NOTHING;

WITH proposed AS (
  SELECT
    id,
    display_name AS old_name,
    public._name_backfill_format_person_name(display_name) AS new_name,
    public.normalize_person_name(public._name_backfill_format_person_name(display_name)) AS new_normalized_name,
    state,
    office_key
  FROM public.persons
  WHERE display_name IS NOT NULL
)
UPDATE public.persons p
SET display_name = proposed.new_name,
    updated_at = now()
FROM proposed
WHERE p.id = proposed.id
  AND p.display_name IS DISTINCT FROM proposed.new_name
  AND NOT EXISTS (
    SELECT 1
    FROM public.persons other
    WHERE other.id <> p.id
      AND other.normalized_name = proposed.new_normalized_name
      AND coalesce(other.state, '') = coalesce(proposed.state, '')
      AND coalesce(other.office_key, '') = coalesce(proposed.office_key, '')
  );

DROP FUNCTION IF EXISTS public._name_backfill_format_person_name(text);
DROP FUNCTION IF EXISTS public._name_backfill_strip_suffixes(text[]);
DROP FUNCTION IF EXISTS public._name_backfill_format_part(text);
DROP FUNCTION IF EXISTS public._name_backfill_format_token(text);
DROP FUNCTION IF EXISTS public._name_backfill_format_initial(text);
DROP FUNCTION IF EXISTS public._name_backfill_format_suffix(text);
DROP FUNCTION IF EXISTS public._name_backfill_is_suffix(text);
DROP FUNCTION IF EXISTS public._name_backfill_clean_token(text);
