ALTER FUNCTION public._candidate_name_key(text) SET search_path = public;
ALTER FUNCTION public._candidate_district_key(text) SET search_path = public;
ALTER FUNCTION public._candidate_office_class(text) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public._candidate_name_key(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._candidate_district_key(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._candidate_office_class(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._merge_candidate(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_duplicate_candidate() FROM PUBLIC, anon, authenticated;