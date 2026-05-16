CREATE UNIQUE INDEX IF NOT EXISTS donor_aliases_canonical_name_ci_uniq
  ON public.donor_aliases (lower(btrim(canonical_name)));