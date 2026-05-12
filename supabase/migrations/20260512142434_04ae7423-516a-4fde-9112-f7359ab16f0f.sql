-- share_cards: hide user_id from anonymous role
REVOKE SELECT (user_id) ON public.share_cards FROM anon;

-- candidates: hide user-linkage columns from anonymous role
REVOKE SELECT (claimed_by_user_id, claimed_at) ON public.candidates FROM anon;