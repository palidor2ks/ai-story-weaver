-- Resolver to expand a single FEC committee ID into all members of its alias group.
-- Returns ARRAY[p_fec_id] if the ID is not part of any active alias.
CREATE OR REPLACE FUNCTION public.resolve_committee_alias(p_fec_id text)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT a.fec_committee_ids
      FROM public.committee_aliases a
      WHERE a.is_active = true
        AND p_fec_id = ANY(a.fec_committee_ids)
        AND array_length(a.fec_committee_ids, 1) >= 1
      ORDER BY array_length(a.fec_committee_ids, 1) DESC
      LIMIT 1
    ),
    ARRAY[p_fec_id]
  );
$$;

GRANT EXECUTE ON FUNCTION public.resolve_committee_alias(text) TO anon, authenticated, service_role;

-- Lookup index to speed up array membership search.
CREATE INDEX IF NOT EXISTS idx_committee_aliases_fec_ids_gin
  ON public.committee_aliases USING gin (fec_committee_ids);