-- Server-side "visible states" filter for candidate topic scores.
--
-- Why: the directory only ever shows candidates in non-hidden states (≈480 of ≈2,700),
-- but the client was fetching the entire calculated_candidate_topic_scores table (~15k rows)
-- to match-score them. PR #460 pushed the same hidden-state filter onto the candidates query;
-- this does it for topic scores too, keeping the visible/hidden boundary a single backend
-- concern (mirrors get_hidden_state_codes) instead of client plumbing — and avoids shipping
-- scores for candidates that are never displayed.
--
-- SECURITY DEFINER (like get_hidden_state_codes) so it can read RLS-protected candidates +
-- hidden_states. It only returns topic-score rows for visible candidates — all of which are
-- already publicly readable (calculated_candidate_topic_scores has no RLS), so this exposes
-- nothing new; it returns strictly less.

CREATE OR REPLACE FUNCTION public.get_visible_candidate_topic_scores()
RETURNS TABLE(candidate_id text, topic_id text, calculated_score numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT cts.candidate_id, cts.topic_id, cts.calculated_score
  FROM public.calculated_candidate_topic_scores cts
  JOIN public.candidates c ON c.id = cts.candidate_id
  WHERE c.state NOT IN (SELECT state_code FROM public.hidden_states);
$function$;

GRANT EXECUTE ON FUNCTION public.get_visible_candidate_topic_scores() TO anon, authenticated;
