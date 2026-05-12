# Fix: Hidden states no longer filtered (all states visible)

## Root cause
`useHiddenStates` calls `supabase.rpc('get_hidden_state_codes')`. That function currently has EXECUTE granted only to `postgres` and `service_role` — same fallout as the `has_role` issue from the recent security migrations. For every signed-in user the RPC errors with `permission denied for function get_hidden_state_codes`, the hook falls back to an empty Set, and `isHidden(state)` returns false for all states → every state renders.

This function is intentionally callable by all users (it just returns a list of state codes flagged as hidden, no PII), so restoring EXECUTE is the correct fix.

## Fix
One small migration:

```sql
GRANT EXECUTE ON FUNCTION public.get_hidden_state_codes()
  TO authenticated, anon;
```

## Audit other RPCs called from the client
While we're at it, sweep `public.*` SECURITY DEFINER functions that the frontend calls and re-grant where needed. From the codebase the client invokes at least:
- `has_role` (already fixed last turn)
- `get_hidden_state_codes` (this fix)
- `save_quiz_results`, `save_user_topics` (called from quiz flow — both already self-validate `auth.uid() = p_user_id`)
- `get_contribution_totals`, `get_contribution_totals_by_committee` (finance pages)
- `count_donors_matching_patterns`, `resolve_donor_display_name` (donor pages)
- `recalculate_candidate_coverage`, `recalculate_all_coverage_tiers`, `backfill_candidate_scores` (admin only — keep restricted)

Plan: grant EXECUTE to `authenticated` (+ `anon` where genuinely public) on the user-facing RPCs only. Leave admin/maintenance RPCs (`recalculate_*`, `backfill_*`, `refresh_donor_display_names`, `_merge_candidate`) without public execute so only service-role / admins can call them.

```sql
GRANT EXECUTE ON FUNCTION public.get_hidden_state_codes() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.save_quiz_results(uuid, numeric, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_user_topics(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_contribution_totals(text, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_contribution_totals_by_committee(text, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.count_donors_matching_patterns(text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_donor_display_name(text, text) TO authenticated, anon;
```

(If any signature differs slightly we'll match it from `pg_proc` before running.)

## Verification
1. Reload `/candidates` (or wherever the hidden-state filter applies) signed in — hidden states (52 currently in `hidden_states`) should disappear from listings.
2. Console: no more `permission denied for function get_hidden_state_codes` errors.
3. Quiz save still works for signed-in users; finance/donor pages still load contribution totals.

## Out of scope
- No RLS policy changes, no function body changes. Admin-only maintenance RPCs stay restricted.
