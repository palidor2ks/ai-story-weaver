REVOKE ALL ON FUNCTION public.rebuild_donors_for_committee(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rebuild_donors_for_committee(text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.rebuild_donors_for_committee(text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_donors_for_committee(text, text, text) TO service_role;