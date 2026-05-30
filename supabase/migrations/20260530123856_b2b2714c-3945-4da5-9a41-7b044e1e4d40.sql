CREATE OR REPLACE FUNCTION public.resolve_committee_alias(p_fec_id text)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY INVOKER
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