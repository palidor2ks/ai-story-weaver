
-- FL contributions: restrict to admin only
DROP POLICY IF EXISTS fl_contributions_read ON public.fl_contributions;
CREATE POLICY fl_contributions_admin_read ON public.fl_contributions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- NJ ELEC contributions: restrict to admin only
DROP POLICY IF EXISTS nj_elec_contributions_read ON public.nj_elec_contributions;
CREATE POLICY nj_elec_contributions_admin_read ON public.nj_elec_contributions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- NY contributions: restrict to admin only
DROP POLICY IF EXISTS ny_contributions_read ON public.ny_contributions;
CREATE POLICY ny_contributions_admin_read ON public.ny_contributions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- claude_migration_log: enable RLS and admin-only read.
-- The table is normally created out-of-band by scripts/apply-prod-migrations.sh, so a
-- database built purely from migration files (e.g. a Supabase preview branch) doesn't
-- have it yet -- create it here with the same definition so this migration is
-- self-sufficient instead of failing on fresh databases.
CREATE TABLE IF NOT EXISTS public.claude_migration_log(
  filename text primary key,
  applied_at timestamptz not null default now());
ALTER TABLE public.claude_migration_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS claude_migration_log_admin_read ON public.claude_migration_log;
CREATE POLICY claude_migration_log_admin_read ON public.claude_migration_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
