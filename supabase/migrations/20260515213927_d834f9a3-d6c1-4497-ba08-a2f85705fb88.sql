
TRUNCATE public.donor_aliases;

ALTER TABLE public.donor_aliases
  DROP COLUMN IF EXISTS alias_pattern,
  DROP COLUMN IF EXISTS alias_patterns,
  DROP COLUMN IF EXISTS donor_type,
  DROP COLUMN IF EXISTS donor_types;

CREATE TABLE public.donor_alias_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_id uuid NOT NULL REFERENCES public.donor_aliases(id) ON DELETE CASCADE,
  donor_name text NOT NULL,
  donor_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (donor_name, donor_type)
);
CREATE INDEX idx_donor_alias_members_alias ON public.donor_alias_members(alias_id);
CREATE INDEX idx_donor_alias_members_lookup ON public.donor_alias_members(donor_name, donor_type);

ALTER TABLE public.donor_alias_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members are viewable by everyone"
  ON public.donor_alias_members FOR SELECT USING (true);

CREATE POLICY "Admins manage members"
  ON public.donor_alias_members FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages members"
  ON public.donor_alias_members FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP FUNCTION IF EXISTS public.count_donors_matching_patterns(text[], text[]);
DROP FUNCTION IF EXISTS public.refresh_donor_display_names();

CREATE OR REPLACE FUNCTION public.resolve_donor_display_name(p_donor_name text, p_donor_type text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT a.canonical_name
       FROM public.donor_alias_members m
       JOIN public.donor_aliases a ON a.id = m.alias_id
      WHERE m.donor_name = p_donor_name
        AND m.donor_type = p_donor_type
        AND a.is_active = true
      LIMIT 1),
    p_donor_name
  );
$$;
