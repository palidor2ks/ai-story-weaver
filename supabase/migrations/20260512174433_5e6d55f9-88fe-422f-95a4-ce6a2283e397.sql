
GRANT EXECUTE ON FUNCTION public.get_hidden_state_codes() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.save_quiz_results(uuid, numeric, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_user_topics(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_contribution_totals(text, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_contribution_totals_by_committee(text, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.count_donors_matching_patterns(text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_donor_display_name(text, text) TO authenticated, anon;
