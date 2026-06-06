# Dev migration re-sync (Path B)

This repo's Lovable + Supabase setup auto-applies Lovable-authored migrations to the
managed databases, but **migrations authored outside Lovable** (clean-numbered files
committed via Claude/git, e.g. `20260604040000_*.sql`) are not. The Dev project
(`ornnzinjrcyigazecctf`) had therefore fallen ~66 migrations behind `main`.

The Lovable-applied migrations are also recorded under version numbers that differ from
the repo filenames by 1-2 seconds, so a blanket `supabase db push` would try to replay
everything. `scripts/apply-missing-migrations.sh` handles this: it applies only the files
with no matching ledger entry (within a few seconds), in order, idempotently.

## One-time environment setup

To let the agent (or CI) run the re-sync, configure the Claude Code on the web environment
(see https://code.claude.com/docs/en/claude-code-on-the-web):

1. **Network policy** — allow outbound to the Supabase **session pooler** host, e.g.
   `aws-0-<region>.pooler.supabase.com` (port 5432). The default locked-down policy blocks it.
2. **Secret** — add `SUPABASE_DB_URL` = the Dev project's *Session pooler* URI
   (Supabase Dashboard → Connect → Session pooler, port 5432):
   `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`
   Use the **session** pooler (5432), not the transaction pooler (6543) — the migrations use
   DDL / `DO` blocks / `CREATE EXTENSION` that transaction mode rejects.
3. (Optional) `SUPABASE_ACCESS_TOKEN` if you also want `supabase migration list/repair`.

`psql` is already present in the environment. `scripts/dev-session-readiness.sh` (wired as a
SessionStart hook) prints whether the URL is set and the DB is reachable each session.

⚠️ Keep these as **secrets**, scope them to **Dev** (not prod), and rotate after use.

## Running the re-sync

```bash
# 1. See exactly what would be applied (safe; makes no changes):
scripts/apply-missing-migrations.sh

# 2. Apply the non-cron backlog (schema, RPCs, data):
scripts/apply-missing-migrations.sh --apply

# 3. Later, once you've reviewed the scheduled jobs, also enable the crons:
scripts/apply-missing-migrations.sh --apply --include-crons
```

The script skips files already applied (either ledger), records applied files in
`public.claude_migration_log`, runs `CONCURRENTLY` migrations outside a transaction, and
**pauses on cron migrations** by default.

## Cron migrations to review before `--include-crons`

These schedule recurring `pg_cron` jobs that call edge functions (external APIs / AI budget).
Enable them deliberately:

- `20260603030000_nj_elec_cron`, `20260603190200_nj_elec_cron_secret`
- `20260603140100_discover_fec_candidates_cron`
- `20260603150100_drain_research_queue_cron`, `20260603231000_requeue_stalled_research_cron`
- `20260603190000_fec_candidate_drain_cron`, `20260603200000_fix_congress_donor_cron_auth`
- `20260603230500_retire_monthly_donor_sync`
- `20260603330000_fl_finance_cron`, `20260603430000_ny_finance_cron`
- `20260604000000_refresh_donor_consolidated_cron`
- `20260604020000_drain_fec_finance_cron`, `20260605190000_drain_fec_finance_multicycle_cron`,
  `20260605200000_fix_drain_fec_finance_cron_auth_and_cycles`
- `20260604030000_ie_import_cron`
- `20260604040100_enrich_candidate_photos_cron` (photo backfill — see note below)
- `20260604060000_auto_post_due_social_cron`
- `20260605120100_cron_pipeline_health_rpcs`
- `20260604012956_*`, `20260604013138_*`

## Landmine (never auto-applied)

- `20260606000000_fix_trump_portrait_image` — re-sets Trump's `image_url` to a Wikimedia URL,
  which would overwrite the self-hosted Storage photo. Listed in the script's `SKIP_VERSIONS`.

## Already handled out-of-band (no action needed)

Applied directly via the Supabase MCP while fixing the missing-photo issue:

- `photo_attempts` / `photo_checked_at` columns + queue indexes (from `20260604040000`)
- `photo_enrich_secret` (Vault) + `check_photo_enrich_secret()` (from `20260604040100`)
- Re-hosted official portraits to Storage: Trump, Vance, Harris (Biden pending — source throttled)
