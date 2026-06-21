-- Security hardening pass 2: revoke the PostgreSQL PUBLIC pseudo-role EXECUTE
-- grant from admin-only SECURITY DEFINER functions.
--
-- Why a second migration: migration 20260621020000 removed the explicit
-- per-role ACL entries (anon=X/postgres, authenticated=X/postgres). However
-- 28 of the 34 target functions also carry a PUBLIC grant (=X/postgres) —
-- meaning every role including anon inherits EXECUTE via the PUBLIC pseudo-role.
-- That entry must be revoked separately with `FROM PUBLIC` (SQL keyword, not the
-- "public" schema role).
--
-- For Group B functions (admin-panel callers that retain `authenticated` access):
-- the explicit `authenticated=X/postgres` entry was already in place before this
-- migration, so revoking PUBLIC leaves authenticated access intact.
--
-- Verified via pg_proc.proacl before applying: all 28 functions below have the
-- `=X/postgres` (PUBLIC) ACL entry. The 6 functions already correct are omitted:
--   check_bill_sync_secret, check_import_sync_secret, check_nj_sync_secret,
--   check_vote_sync_secret, get_hidden_state_codes, retag_vendor_refunds.

-- GROUP A — revoke PUBLIC, authenticated already absent (service_role only)
REVOKE EXECUTE ON FUNCTION public.answer_audit_detect() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.answer_audit_fix() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_job(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_ie_sync_secret(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ie_reconcile_local(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_politician_candidate_answer_tampering() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reconcile_vote_sync_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.retry_job(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sweep_stalled_import_sessions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_resolve_person_candidates() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_resolve_person_election_candidates() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_resolve_person_static_officials() FROM PUBLIC;

-- GROUP B — revoke PUBLIC; explicit authenticated=X/postgres entry is retained
REVOKE EXECUTE ON FUNCTION public.auto_merge_obvious_persons() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_redundant_ai_candidates() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_admin_user_last_signins() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_cron_job_failures(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_cron_job_health(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_donor_alias_member_counts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_donor_aliases_page(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pipeline_failure_summary() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pipeline_failures(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_committee_pool(text, text, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.merge_persons(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_committee_pool() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_person(text, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_raw_donors_admin(text, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.undo_donor_import(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.undo_ie_import(text) FROM PUBLIC;
