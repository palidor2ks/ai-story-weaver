-- Security hardening: revoke public EXECUTE grants from admin-only and
-- service-role-only SECURITY DEFINER functions.
--
-- Root cause: Supabase default privileges auto-grant EXECUTE on every public-schema
-- function to `anon` and `authenticated`. Previous `REVOKE ALL FROM public` in
-- individual migrations only removed the PUBLIC pseudo-role ACL entry; the
-- explicit per-role entries added by the default-privilege system remain.
-- This migration issues targeted REVOKEs that actually stick.
--
-- Strategy:
--   Group A — service-role-only functions (no frontend callers):
--              REVOKE from BOTH anon AND authenticated.
--   Group B — admin-panel functions (called via authenticated JWT from admin UI):
--              REVOKE from anon ONLY. Authenticated access is retained so
--              admin panel components continue to work.
--              NOTE: these functions still carry the
--              `authenticated_security_definer_function_executable` advisory warning;
--              the full fix (inline role checks or service_role edge routing) is
--              tracked as follow-on work.
--
-- Not touched: intentionally public-facing RPCs (get_visible_candidates,
--   get_race_candidates, get_donors_paginated, submit_poll_response, etc.)
--
-- References:
--   https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
--   https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

-- ============================================================
-- GROUP A: Revoke from BOTH anon AND authenticated
-- These are called by pg_cron, edge functions (service_role),
-- or DB triggers only — no frontend component invokes them.
-- ============================================================

-- DB cron audit functions (called by pg_cron scheduler, not users)
REVOKE EXECUTE ON FUNCTION public.answer_audit_detect() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.answer_audit_fix() FROM anon, authenticated;

-- Sync secret validators: verify edge-function tokens, service_role callers only.
-- An anonymous caller gaining EXECUTE could probe whether any token is valid.
REVOKE EXECUTE ON FUNCTION public.check_bill_sync_secret(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_ie_sync_secret(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_import_sync_secret(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_nj_sync_secret(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_vote_sync_secret(text) FROM anon, authenticated;

-- Job queue management: present in production DB and types but were created outside
-- migrations (no CREATE FUNCTION in repo), so they may not exist in the preview branch.
-- Guard with exception handling to keep the migration idempotent across environments.
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.cancel_job(uuid) FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.retry_job(uuid) FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- ETL / reconciliation pipeline: called by edge functions via service_role only.
REVOKE EXECUTE ON FUNCTION public.ie_reconcile_local(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reconcile_vote_sync_status() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sweep_stalled_import_sessions() FROM anon, authenticated;

-- Trigger functions: invoked by PostgreSQL trigger mechanism, not user RPC.
-- Revoking EXECUTE from roles does not affect trigger invocation.
REVOKE EXECUTE ON FUNCTION public.prevent_politician_candidate_answer_tampering() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_resolve_person_candidates() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_resolve_person_election_candidates() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_resolve_person_static_officials() FROM anon, authenticated;

-- ============================================================
-- GROUP B: Revoke from anon ONLY (keep for authenticated)
-- These are called from admin UI components via the client-side
-- Supabase session (authenticated JWT). Anon access is the
-- immediate risk: the admin panel requires login, so no real
-- admin action is possible anonymously — but the functions must
-- not be callable without authentication at all.
-- ============================================================

-- DuplicatePersonsPanel.tsx — merge/dedup operations
REVOKE EXECUTE ON FUNCTION public.merge_persons(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_merge_obvious_persons() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_redundant_ai_candidates() FROM anon;

-- VendorRefundsPanel.tsx
REVOKE EXECUTE ON FUNCTION public.retag_vendor_refunds() FROM anon;

-- DonorImportHistory.tsx / IndependentExpenditureImportHistory.tsx
REVOKE EXECUTE ON FUNCTION public.undo_donor_import(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.undo_ie_import(text) FROM anon;

-- useHiddenStates.ts
REVOKE EXECUTE ON FUNCTION public.get_hidden_state_codes() FROM anon;

-- useCronHealth.ts (admin observability)
REVOKE EXECUTE ON FUNCTION public.get_cron_job_health(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_cron_job_failures(text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_pipeline_failure_summary() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_pipeline_failures(text, integer) FROM anon;

-- useCommitteePool.ts (admin committee management)
REVOKE EXECUTE ON FUNCTION public.list_committee_pool(text, text, text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_committee_pool() FROM anon;

-- useDonorsPaginated.ts / useDonorAliases.ts (admin donor tools)
REVOKE EXECUTE ON FUNCTION public.search_raw_donors_admin(text, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_donor_aliases_page(text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_donor_alias_member_counts() FROM anon;

-- AdminUsersPanel.tsx
REVOKE EXECUTE ON FUNCTION public.get_admin_user_last_signins() FROM anon;

-- Person resolution: intended for authenticated callers and edge functions only.
-- Original grant (20260602...) was `authenticated, service_role` — not anon.
REVOKE EXECUTE ON FUNCTION public.resolve_person(text, text, text, text, text, text) FROM anon;
