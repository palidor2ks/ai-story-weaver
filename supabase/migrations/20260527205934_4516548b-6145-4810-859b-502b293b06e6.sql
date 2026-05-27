GRANT SELECT ON public.committee_aliases TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.committee_aliases TO authenticated;
GRANT ALL ON public.committee_aliases TO service_role;