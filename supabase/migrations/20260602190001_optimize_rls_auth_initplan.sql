-- Optimize RLS policies flagged by the Supabase performance advisor
-- (lint 0003_auth_rls_initplan).
--
-- Wrapping auth.uid()/auth.role() in a scalar subquery -- (select auth.uid()) --
-- lets Postgres evaluate the auth function once per statement (InitPlan) instead
-- of once per row. This is the Supabase-recommended optimization and is
-- semantically identical to the original policies: roles, commands, USING and
-- WITH CHECK logic are unchanged -- only the function call is wrapped.
--
-- 163 policies across the public schema are recreated below. Statements were
-- generated from pg_policies (so each expression matches the live definition) and
-- run atomically within this migration's transaction, so RLS is never disabled
-- mid-flight. No current_setting()/auth.jwt() calls were present, and no policy
-- was already optimized, so this covers every flagged policy.


DROP POLICY IF EXISTS "Admins can manage stats cache" ON public.admin_stats_cache;
CREATE POLICY "Admins can manage stats cache" ON public.admin_stats_cache
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role manages AI analysis cache" ON public.ai_analysis_cache;
CREATE POLICY "Service role manages AI analysis cache" ON public.ai_analysis_cache
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users can read their own AI analysis cache" ON public.ai_analysis_cache;
CREATE POLICY "Users can read their own AI analysis cache" ON public.ai_analysis_cache
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "badge_definitions admin write" ON public.badge_definitions;
CREATE POLICY "badge_definitions admin write" ON public.badge_definitions
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage bill ingestion status" ON public.bill_ingestion_status;
CREATE POLICY "Admins can manage bill ingestion status" ON public.bill_ingestion_status
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role has full access to bill ingestion status" ON public.bill_ingestion_status;
CREATE POLICY "Service role has full access to bill ingestion status" ON public.bill_ingestion_status
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins can view bill ingestion status" ON public.bill_ingestion_status;
CREATE POLICY "Admins can view bill ingestion status" ON public.bill_ingestion_status
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage bill sponsors" ON public.bill_sponsors;
CREATE POLICY "Admins can manage bill sponsors" ON public.bill_sponsors
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage bill sponsors" ON public.bill_sponsors;
CREATE POLICY "Service role can manage bill sponsors" ON public.bill_sponsors
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins can manage bill sync status" ON public.bill_sync_status;
CREATE POLICY "Admins can manage bill sync status" ON public.bill_sync_status
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage bill sync status" ON public.bill_sync_status;
CREATE POLICY "Service role can manage bill sync status" ON public.bill_sync_status
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Only admins can view bill sync status" ON public.bill_sync_status;
CREATE POLICY "Only admins can view bill sync status" ON public.bill_sync_status
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage bills" ON public.bills;
CREATE POLICY "Admins can manage bills" ON public.bills
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage bills" ON public.bills;
CREATE POLICY "Service role can manage bills" ON public.bills
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins can manage candidate answers" ON public.candidate_answers;
CREATE POLICY "Admins can manage candidate answers" ON public.candidate_answers
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Politicians can update evidence on their claimed answers" ON public.candidate_answers;
CREATE POLICY "Politicians can update evidence on their claimed answers" ON public.candidate_answers
  AS PERMISSIVE FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM candidates c
  WHERE ((c.id = candidate_answers.candidate_id) AND (c.claimed_by_user_id = (select auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM candidates c
  WHERE ((c.id = candidate_answers.candidate_id) AND (c.claimed_by_user_id = (select auth.uid()))))));

DROP POLICY IF EXISTS "Admins can manage committee mappings" ON public.candidate_committees;
CREATE POLICY "Admins can manage committee mappings" ON public.candidate_committees
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage FEC IDs" ON public.candidate_fec_ids;
CREATE POLICY "Admins can manage FEC IDs" ON public.candidate_fec_ids
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage FEC IDs" ON public.candidate_fec_ids;
CREATE POLICY "Service role can manage FEC IDs" ON public.candidate_fec_ids
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins can manage overrides" ON public.candidate_overrides;
CREATE POLICY "Admins can manage overrides" ON public.candidate_overrides
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Politicians can insert their claimed candidate overrides" ON public.candidate_overrides;
CREATE POLICY "Politicians can insert their claimed candidate overrides" ON public.candidate_overrides
  AS PERMISSIVE FOR INSERT
  TO public
  WITH CHECK (((EXISTS ( SELECT 1
   FROM candidates c
  WHERE ((c.id = candidate_overrides.candidate_id) AND (c.claimed_by_user_id = (select auth.uid()))))) AND (has_role((select auth.uid()), 'admin'::app_role) OR ((overall_score IS NULL) AND (coverage_tier IS NULL) AND (confidence IS NULL) AND (created_by IS NULL) AND (updated_by IS NULL)))));

DROP POLICY IF EXISTS "Politicians can update their claimed candidate overrides" ON public.candidate_overrides;
CREATE POLICY "Politicians can update their claimed candidate overrides" ON public.candidate_overrides
  AS PERMISSIVE FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM candidates c
  WHERE ((c.id = candidate_overrides.candidate_id) AND (c.claimed_by_user_id = (select auth.uid()))))))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM candidates c
  WHERE ((c.id = candidate_overrides.candidate_id) AND (c.claimed_by_user_id = (select auth.uid()))))) AND (has_role((select auth.uid()), 'admin'::app_role) OR ((NOT (overall_score IS DISTINCT FROM ( SELECT co.overall_score
   FROM candidate_overrides co
  WHERE (co.id = candidate_overrides.id)))) AND (NOT (coverage_tier IS DISTINCT FROM ( SELECT co.coverage_tier
   FROM candidate_overrides co
  WHERE (co.id = candidate_overrides.id)))) AND (NOT (confidence IS DISTINCT FROM ( SELECT co.confidence
   FROM candidate_overrides co
  WHERE (co.id = candidate_overrides.id)))) AND (NOT (created_by IS DISTINCT FROM ( SELECT co.created_by
   FROM candidate_overrides co
  WHERE (co.id = candidate_overrides.id)))) AND (NOT (updated_by IS DISTINCT FROM (select auth.uid())))))));

DROP POLICY IF EXISTS "Admins can manage candidate votes" ON public.candidate_votes;
CREATE POLICY "Admins can manage candidate votes" ON public.candidate_votes
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage candidate votes" ON public.candidate_votes;
CREATE POLICY "Service role can manage candidate votes" ON public.candidate_votes
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Service role can manage cache" ON public.civic_lookup_cache;
CREATE POLICY "Service role can manage cache" ON public.civic_lookup_cache
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins can view civic lookup cache" ON public.civic_lookup_cache;
CREATE POLICY "Admins can view civic lookup cache" ON public.civic_lookup_cache
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage committee aliases" ON public.committee_aliases;
CREATE POLICY "Admins manage committee aliases" ON public.committee_aliases
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage committee causes" ON public.committee_causes;
CREATE POLICY "Admins can manage committee causes" ON public.committee_causes
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage committee causes" ON public.committee_causes;
CREATE POLICY "Service role can manage committee causes" ON public.committee_causes
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins can manage rollups" ON public.committee_finance_rollups;
CREATE POLICY "Admins can manage rollups" ON public.committee_finance_rollups
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage rollups" ON public.committee_finance_rollups;
CREATE POLICY "Service role can manage rollups" ON public.committee_finance_rollups
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins can manage committee topics" ON public.committee_topics;
CREATE POLICY "Admins can manage committee topics" ON public.committee_topics
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage committee topics" ON public.committee_topics;
CREATE POLICY "Service role can manage committee topics" ON public.committee_topics
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins can manage contributions" ON public.contributions;
CREATE POLICY "Admins can manage contributions" ON public.contributions
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage contributions" ON public.contributions;
CREATE POLICY "Service role can manage contributions" ON public.contributions
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins can view contributions" ON public.contributions;
CREATE POLICY "Admins can view contributions" ON public.contributions
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage members" ON public.donor_alias_members;
CREATE POLICY "Admins manage members" ON public.donor_alias_members
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role manages members" ON public.donor_alias_members;
CREATE POLICY "Service role manages members" ON public.donor_alias_members
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins can manage donor aliases" ON public.donor_aliases;
CREATE POLICY "Admins can manage donor aliases" ON public.donor_aliases
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage donor cause overrides" ON public.donor_cause_overrides;
CREATE POLICY "Admins manage donor cause overrides" ON public.donor_cause_overrides
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role manages donor cause overrides" ON public.donor_cause_overrides;
CREATE POLICY "Service role manages donor cause overrides" ON public.donor_cause_overrides
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins manage donor import sessions" ON public.donor_import_sessions;
CREATE POLICY "Admins manage donor import sessions" ON public.donor_import_sessions
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role manages donor import sessions" ON public.donor_import_sessions;
CREATE POLICY "Service role manages donor import sessions" ON public.donor_import_sessions
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins can view donor sync runs" ON public.donor_sync_runs;
CREATE POLICY "Admins can view donor sync runs" ON public.donor_sync_runs
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage donors" ON public.donors;
CREATE POLICY "Service role can manage donors" ON public.donors
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins can manage election candidates" ON public.election_candidates;
CREATE POLICY "Admins can manage election candidates" ON public.election_candidates
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage election candidates" ON public.election_candidates;
CREATE POLICY "Service role can manage election candidates" ON public.election_candidates
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins can manage elections" ON public.elections;
CREATE POLICY "Admins can manage elections" ON public.elections
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage elections" ON public.elections;
CREATE POLICY "Service role can manage elections" ON public.elections
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins can manage external committee finance" ON public.external_committee_finance;
CREATE POLICY "Admins can manage external committee finance" ON public.external_committee_finance
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage external committee finance" ON public.external_committee_finance;
CREATE POLICY "Service role can manage external committee finance" ON public.external_committee_finance
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins can manage external pacs" ON public.external_pacs;
CREATE POLICY "Admins can manage external pacs" ON public.external_pacs
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage external pacs" ON public.external_pacs;
CREATE POLICY "Service role can manage external pacs" ON public.external_pacs
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins can manage fec committee sync status" ON public.fec_committee_sync_status;
CREATE POLICY "Admins can manage fec committee sync status" ON public.fec_committee_sync_status
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage fec committee sync status" ON public.fec_committee_sync_status;
CREATE POLICY "Service role can manage fec committee sync status" ON public.fec_committee_sync_status
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins can manage reconciliation" ON public.finance_reconciliation;
CREATE POLICY "Admins can manage reconciliation" ON public.finance_reconciliation
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage reconciliation" ON public.finance_reconciliation;
CREATE POLICY "Service role can manage reconciliation" ON public.finance_reconciliation
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins can view finance reconciliation" ON public.finance_reconciliation;
CREATE POLICY "Admins can view finance reconciliation" ON public.finance_reconciliation
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage hidden states" ON public.hidden_states;
CREATE POLICY "Admins can manage hidden states" ON public.hidden_states
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can read hidden states" ON public.hidden_states;
CREATE POLICY "Admins can read hidden states" ON public.hidden_states
  AS PERMISSIVE FOR SELECT
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete IE exclusions" ON public.ie_excluded_committees;
CREATE POLICY "Admins can delete IE exclusions" ON public.ie_excluded_committees
  AS PERMISSIVE FOR DELETE
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert IE exclusions" ON public.ie_excluded_committees;
CREATE POLICY "Admins can insert IE exclusions" ON public.ie_excluded_committees
  AS PERMISSIVE FOR INSERT
  TO public
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can read IE exclusions" ON public.ie_excluded_committees;
CREATE POLICY "Admins can read IE exclusions" ON public.ie_excluded_committees
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update IE exclusions" ON public.ie_excluded_committees;
CREATE POLICY "Admins can update IE exclusions" ON public.ie_excluded_committees
  AS PERMISSIVE FOR UPDATE
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert ie import sessions" ON public.ie_import_sessions;
CREATE POLICY "Admins can insert ie import sessions" ON public.ie_import_sessions
  AS PERMISSIVE FOR INSERT
  TO public
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can select ie import sessions" ON public.ie_import_sessions;
CREATE POLICY "Admins can select ie import sessions" ON public.ie_import_sessions
  AS PERMISSIVE FOR SELECT
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update ie import sessions" ON public.ie_import_sessions;
CREATE POLICY "Admins can update ie import sessions" ON public.ie_import_sessions
  AS PERMISSIVE FOR UPDATE
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage independent expenditures" ON public.independent_expenditures;
CREATE POLICY "Admins can manage independent expenditures" ON public.independent_expenditures
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins read job_dead_letters" ON public.job_dead_letters;
CREATE POLICY "Admins read job_dead_letters" ON public.job_dead_letters
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins read job_queue" ON public.job_queue;
CREATE POLICY "Admins read job_queue" ON public.job_queue
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins update job_queue" ON public.job_queue;
CREATE POLICY "Admins update job_queue" ON public.job_queue
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins read job_runs" ON public.job_runs;
CREATE POLICY "Admins read job_runs" ON public.job_runs
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage mayor fetch queue" ON public.mayor_fetch_queue;
CREATE POLICY "Admins can manage mayor fetch queue" ON public.mayor_fetch_queue
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage mayor fetch queue" ON public.mayor_fetch_queue;
CREATE POLICY "Service role can manage mayor fetch queue" ON public.mayor_fetch_queue
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins can view mayor fetch queue" ON public.mayor_fetch_queue;
CREATE POLICY "Admins can view mayor fetch queue" ON public.mayor_fetch_queue
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "news_article_questions admin write" ON public.news_article_questions;
CREATE POLICY "news_article_questions admin write" ON public.news_article_questions
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "news_articles admin write" ON public.news_articles;
CREATE POLICY "news_articles admin write" ON public.news_articles
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage transitions" ON public.official_transitions;
CREATE POLICY "Admins can manage transitions" ON public.official_transitions
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage transitions" ON public.official_transitions;
CREATE POLICY "Service role can manage transitions" ON public.official_transitions
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins can manage PAC candidate totals" ON public.pac_candidate_totals;
CREATE POLICY "Admins can manage PAC candidate totals" ON public.pac_candidate_totals
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage PAC candidate totals" ON public.pac_candidate_totals;
CREATE POLICY "Service role can manage PAC candidate totals" ON public.pac_candidate_totals
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins can manage PAC expenditures" ON public.pac_expenditures;
CREATE POLICY "Admins can manage PAC expenditures" ON public.pac_expenditures
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage PAC expenditures" ON public.pac_expenditures;
CREATE POLICY "Service role can manage PAC expenditures" ON public.pac_expenditures
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins can manage party answers" ON public.party_answers;
CREATE POLICY "Admins can manage party answers" ON public.party_answers
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage party platforms" ON public.party_platforms;
CREATE POLICY "Admins can manage party platforms" ON public.party_platforms
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "pbn own delete" ON public.pending_badge_notifications;
CREATE POLICY "pbn own delete" ON public.pending_badge_notifications
  AS PERMISSIVE FOR DELETE
  TO public
  USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "pbn own select" ON public.pending_badge_notifications;
CREATE POLICY "pbn own select" ON public.pending_badge_notifications
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Admins manage persons" ON public.persons;
CREATE POLICY "Admins manage persons" ON public.persons
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role manages persons" ON public.persons;
CREATE POLICY "Service role manages persons" ON public.persons
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins manage poll questions" ON public.poll_questions;
CREATE POLICY "Admins manage poll questions" ON public.poll_questions
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Anyone can view poll questions of published polls" ON public.poll_questions;
CREATE POLICY "Anyone can view poll questions of published polls" ON public.poll_questions
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM polls p
  WHERE ((p.id = poll_questions.poll_id) AND ((p.status = 'published'::text) OR has_role((select auth.uid()), 'admin'::app_role))))));

DROP POLICY IF EXISTS "Users see own answers, admins see all" ON public.poll_response_answers;
CREATE POLICY "Users see own answers, admins see all" ON public.poll_response_answers
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM poll_responses r
  WHERE ((r.id = poll_response_answers.response_id) AND ((r.user_id = (select auth.uid())) OR has_role((select auth.uid()), 'admin'::app_role))))));

DROP POLICY IF EXISTS "Users can delete their own poll responses" ON public.poll_responses;
CREATE POLICY "Users can delete their own poll responses" ON public.poll_responses
  AS PERMISSIVE FOR DELETE
  TO public
  USING (((user_id = (select auth.uid())) AND (user_id IS NOT NULL)));

DROP POLICY IF EXISTS "Users see own responses, admins see all" ON public.poll_responses;
CREATE POLICY "Users see own responses, admins see all" ON public.poll_responses
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((user_id = (select auth.uid())) OR has_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "Admins update poll responses" ON public.poll_responses;
CREATE POLICY "Admins update poll responses" ON public.poll_responses
  AS PERMISSIVE FOR UPDATE
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage poll_social_posts" ON public.poll_social_posts;
CREATE POLICY "Admins manage poll_social_posts" ON public.poll_social_posts
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage polls" ON public.polls;
CREATE POLICY "Admins manage polls" ON public.polls
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Anyone can view published polls" ON public.polls;
CREATE POLICY "Anyone can view published polls" ON public.polls
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((status = 'published'::text) OR has_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.profile_access_log;
CREATE POLICY "Admins can view all audit logs" ON public.profile_access_log
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage claims" ON public.profile_claims;
CREATE POLICY "Admins can manage claims" ON public.profile_claims
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated users can submit claims" ON public.profile_claims;
CREATE POLICY "Authenticated users can submit claims" ON public.profile_claims
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK ((((select auth.uid()) = user_id) AND (status = 'pending'::text) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND (rejection_reason IS NULL)));

DROP POLICY IF EXISTS "Admins can view all claims" ON public.profile_claims;
CREATE POLICY "Admins can view all claims" ON public.profile_claims
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated users can view their own claims" ON public.profile_claims;
CREATE POLICY "Authenticated users can view their own claims" ON public.profile_claims
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;
CREATE POLICY "Users can delete their own profile" ON public.profiles
  AS PERMISSIVE FOR DELETE
  TO authenticated
  USING (((select auth.uid()) = id));

DROP POLICY IF EXISTS "Authenticated users can insert their own profile" ON public.profiles;
CREATE POLICY "Authenticated users can insert their own profile" ON public.profiles
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (((select auth.uid()) = id));

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated users can view their own profile" ON public.profiles;
CREATE POLICY "Authenticated users can view their own profile" ON public.profiles
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (((select auth.uid()) = id));

DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" ON public.profiles
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (((select auth.uid()) = id))
  WITH CHECK (((select auth.uid()) = id));

DROP POLICY IF EXISTS "question_news_feed_cache admin write" ON public.question_news_feed_cache;
CREATE POLICY "question_news_feed_cache admin write" ON public.question_news_feed_cache
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage question options" ON public.question_options;
CREATE POLICY "Admins can manage question options" ON public.question_options
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage all notifications" ON public.question_update_notifications;
CREATE POLICY "Admins can manage all notifications" ON public.question_update_notifications
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage notifications" ON public.question_update_notifications;
CREATE POLICY "Service role can manage notifications" ON public.question_update_notifications
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Politicians can view their candidate notifications" ON public.question_update_notifications;
CREATE POLICY "Politicians can view their candidate notifications" ON public.question_update_notifications
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((entity_type = 'candidate'::text) AND (EXISTS ( SELECT 1
   FROM candidates c
  WHERE ((c.id = question_update_notifications.entity_id) AND (c.claimed_by_user_id = (select auth.uid())))))));

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.question_update_notifications;
CREATE POLICY "Users can view their own notifications" ON public.question_update_notifications
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((entity_type = 'user'::text) AND (entity_id = ((select auth.uid()))::text)));

DROP POLICY IF EXISTS "Politicians can update their candidate notifications" ON public.question_update_notifications;
CREATE POLICY "Politicians can update their candidate notifications" ON public.question_update_notifications
  AS PERMISSIVE FOR UPDATE
  TO public
  USING (((entity_type = 'candidate'::text) AND (EXISTS ( SELECT 1
   FROM candidates c
  WHERE ((c.id = question_update_notifications.entity_id) AND (c.claimed_by_user_id = (select auth.uid())))))));

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.question_update_notifications;
CREATE POLICY "Users can update their own notifications" ON public.question_update_notifications
  AS PERMISSIVE FOR UPDATE
  TO public
  USING (((entity_type = 'user'::text) AND (entity_id = ((select auth.uid()))::text)));

DROP POLICY IF EXISTS "Admins can manage questions" ON public.questions;
CREATE POLICY "Admins can manage questions" ON public.questions
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can manage their own answers" ON public.quiz_answers;
CREATE POLICY "Users can manage their own answers" ON public.quiz_answers
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Admins can view all quiz answers" ON public.quiz_answers;
CREATE POLICY "Admins can view all quiz answers" ON public.quiz_answers
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view their own answers" ON public.quiz_answers;
CREATE POLICY "Users can view their own answers" ON public.quiz_answers
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "representative_social_posts admin write" ON public.representative_social_posts;
CREATE POLICY "representative_social_posts admin write" ON public.representative_social_posts
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can insert their own share cards" ON public.share_cards;
CREATE POLICY "Users can insert their own share cards" ON public.share_cards
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK ((((select auth.uid()) IS NOT NULL) AND (user_id = (select auth.uid()))));

DROP POLICY IF EXISTS "Owners can read their own share cards" ON public.share_cards;
CREATE POLICY "Owners can read their own share cards" ON public.share_cards
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Admins manage social_post_platforms" ON public.social_post_platforms;
CREATE POLICY "Admins manage social_post_platforms" ON public.social_post_platforms
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role manages social_post_platforms" ON public.social_post_platforms;
CREATE POLICY "Service role manages social_post_platforms" ON public.social_post_platforms
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins manage social_post_settings" ON public.social_post_settings;
CREATE POLICY "Admins manage social_post_settings" ON public.social_post_settings
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role manages social_post_settings" ON public.social_post_settings;
CREATE POLICY "Service role manages social_post_settings" ON public.social_post_settings
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins manage social_posts" ON public.social_posts;
CREATE POLICY "Admins manage social_posts" ON public.social_posts
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role manages social_posts" ON public.social_posts;
CREATE POLICY "Service role manages social_posts" ON public.social_posts
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins can manage officials" ON public.static_officials;
CREATE POLICY "Admins can manage officials" ON public.static_officials
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "uae own select" ON public.user_activity_events;
CREATE POLICY "uae own select" ON public.user_activity_events
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS user_badges_select_own ON public.user_badges;
CREATE POLICY user_badges_select_own ON public.user_badges
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Service role can manage party comparisons" ON public.user_party_comparisons;
CREATE POLICY "Service role can manage party comparisons" ON public.user_party_comparisons
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users can delete their own party comparisons" ON public.user_party_comparisons;
CREATE POLICY "Users can delete their own party comparisons" ON public.user_party_comparisons
  AS PERMISSIVE FOR DELETE
  TO public
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert their own party comparisons" ON public.user_party_comparisons;
CREATE POLICY "Users can insert their own party comparisons" ON public.user_party_comparisons
  AS PERMISSIVE FOR INSERT
  TO public
  WITH CHECK (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view their own party comparisons" ON public.user_party_comparisons;
CREATE POLICY "Users can view their own party comparisons" ON public.user_party_comparisons
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update their own party comparisons" ON public.user_party_comparisons;
CREATE POLICY "Users can update their own party comparisons" ON public.user_party_comparisons
  AS PERMISSIVE FOR UPDATE
  TO public
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service role can manage comparisons" ON public.user_rep_comparisons;
CREATE POLICY "Service role can manage comparisons" ON public.user_rep_comparisons
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users can delete their own comparisons" ON public.user_rep_comparisons;
CREATE POLICY "Users can delete their own comparisons" ON public.user_rep_comparisons
  AS PERMISSIVE FOR DELETE
  TO public
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert their own comparisons" ON public.user_rep_comparisons;
CREATE POLICY "Users can insert their own comparisons" ON public.user_rep_comparisons
  AS PERMISSIVE FOR INSERT
  TO public
  WITH CHECK (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view their own comparisons" ON public.user_rep_comparisons;
CREATE POLICY "Users can view their own comparisons" ON public.user_rep_comparisons
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update their own comparisons" ON public.user_rep_comparisons;
CREATE POLICY "Users can update their own comparisons" ON public.user_rep_comparisons
  AS PERMISSIVE FOR UPDATE
  TO public
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles" ON public.user_roles
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles" ON public.user_roles
  AS PERMISSIVE FOR SELECT
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles" ON public.user_roles
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own scores" ON public.user_topic_scores;
CREATE POLICY "Users can manage their own scores" ON public.user_topic_scores
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Admins can view all user topic scores" ON public.user_topic_scores;
CREATE POLICY "Admins can view all user topic scores" ON public.user_topic_scores
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view their own scores" ON public.user_topic_scores;
CREATE POLICY "Users can view their own scores" ON public.user_topic_scores
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own topics" ON public.user_topics;
CREATE POLICY "Users can manage their own topics" ON public.user_topics
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Admins can view all user topics" ON public.user_topics;
CREATE POLICY "Admins can view all user topics" ON public.user_topics
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view their own topics" ON public.user_topics;
CREATE POLICY "Users can view their own topics" ON public.user_topics
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Admins manage vendor refund orgs" ON public.vendor_refund_organizations;
CREATE POLICY "Admins manage vendor refund orgs" ON public.vendor_refund_organizations
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role manages vendor refund orgs" ON public.vendor_refund_organizations;
CREATE POLICY "Service role manages vendor refund orgs" ON public.vendor_refund_organizations
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admins can manage vote sync status" ON public.vote_sync_status;
CREATE POLICY "Admins can manage vote sync status" ON public.vote_sync_status
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage vote sync status" ON public.vote_sync_status;
CREATE POLICY "Service role can manage vote sync status" ON public.vote_sync_status
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Only admins can view vote sync status" ON public.vote_sync_status;
CREATE POLICY "Only admins can view vote sync status" ON public.vote_sync_status
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "x_account_tokens admin-or-service only (restrictive)" ON public.x_account_tokens;
CREATE POLICY "x_account_tokens admin-or-service only (restrictive)" ON public.x_account_tokens
  AS RESTRICTIVE FOR ALL
  TO public
  USING ((((select auth.role()) = 'service_role'::text) OR has_role((select auth.uid()), 'admin'::app_role)))
  WITH CHECK ((((select auth.role()) = 'service_role'::text) OR has_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "Admins can delete x_account_tokens" ON public.x_account_tokens;
CREATE POLICY "Admins can delete x_account_tokens" ON public.x_account_tokens
  AS PERMISSIVE FOR DELETE
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert x_account_tokens" ON public.x_account_tokens;
CREATE POLICY "Admins can insert x_account_tokens" ON public.x_account_tokens
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can view x_account_tokens" ON public.x_account_tokens;
CREATE POLICY "Admins can view x_account_tokens" ON public.x_account_tokens
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update x_account_tokens" ON public.x_account_tokens;
CREATE POLICY "Admins can update x_account_tokens" ON public.x_account_tokens
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role manages x_oauth_pending" ON public.x_oauth_pending;
CREATE POLICY "Service role manages x_oauth_pending" ON public.x_oauth_pending
  AS PERMISSIVE FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));
