# HANDOFF.md

> The **baton**. Reverse-chronological session log — the **TOP entry is "where we left off."**
> **Read it first** at the start of a session. **Write it last:** before ending ANY session in
> which you changed code, config, or docs, append a new entry to the TOP using the template below.
> The SessionStart hook auto-prints the top entry, so keep it accurate.

## Entry template (copy this, fill it in, put it at the TOP)

```
## YYYY-MM-DD — <session or branch name>

**What happened & why**
<The story, not a file list. WHY did this work happen and what was the intent?
A future reader can diff the files; they can't recover your reasoning.>

**State** (verified)
<What is actually true right now and how you know — e.g. "lint passes, build succeeds,
manual check of X". Say what is NOT verified, too.>

**Next**
<ONE concrete next step — the very next action someone should take.>

**Deferred**
<Parked items / things intentionally not done, so they aren't silently forgotten.>
```

---

## 2026-06-10 — claude/database-migration-railway-3r08O

**What happened & why**
User asked to migrate the database to Railway (keeping Supabase for auth) to fix query/API
timeouts. Instead of committing to that multi-week rebuild, we diagnosed the live DB first
(performance advisor + pg_stat_statements + role timeouts + table sizes) and found the timeouts
had specific in-place fixes that Railway would NOT solve. Root cause #1: the donor-alias admin
flows (`useDonorAliases.ts`) called `refresh_donor_consolidated_mv()` synchronously from the
browser — a 1–5 min rebuild over contributions (11.6M rows) / donors (2.45M) — so every
attach/detach/delete blew past the 8s API statement timeout and saturated the DB, cascading into
timeouts elsewhere. Fixed in three phases: (A) added a transaction-level advisory-lock stampede
guard to `refresh_donor_consolidated_mv()`, a new admin-only edge function `refresh-donor-mv`
that runs the refresh in the background (EdgeRuntime.waitUntil), and changed the hook to trigger
it fire-and-forget; (B) added the 18 missing FK indexes (advisor lint 0001); (C) wrapped
`auth.*()` in `(select …)` on the large hot tables (initplan, lint 0003). Discovered Phases C/D
were ALREADY written but never applied (`20260602190001` 163-policy initplan fix,
`20260602190000` duplicate-index drop) — the DB is behind on migrations per
`docs/dev-migration-resync.md`. Also fixed a pre-existing red "Supabase Preview" check (a June 7
migration enabled RLS on `claude_migration_log`, which only the deploy script creates, so it
failed on fresh preview DBs).

**State** (verified)
All fixes APPLIED to prod (`ornnzinjrcyigazecctf`) via Supabase MCP and verified live:
remaining_unindexed_fks=0, both duplicate indexes gone, large-table policies wrapped
(truly_unwrapped=0), stampede guard present, edge function `refresh-donor-mv` ACTIVE
(verify_jwt=true). Each migration was dry-run in BEGIN…ROLLBACK before applying. PR #332 MERGED
to main; CI green (Build/Typecheck/Lint/GitGuardian + Supabase Preview all ✅). NOT verified:
local `bun run build` (sandbox can't fetch all devDeps — CI is the authority); the donor-alias
admin UX (no manual click-through done — recommend a smoke test).

**Next**
Catch up the migration backlog on the DB so the remaining committed-but-unapplied perf migration
`20260602190001` (initplan fix for ~150 tiny tables) lands — run
`scripts/apply-missing-migrations.sh` (needs `SUPABASE_DB_URL`; see `docs/dev-migration-resync.md`).

**Deferred**
- `multiple_permissive_policies` consolidation (666 findings) — changes policy structure; risky
  without tests. Left as follow-up.
- Dropping "unused" indexes / global `statement_timeout` tuning — risky to guess; documented only.
- Railway DB migration — parked as a documented fallback in `/root/.claude/plans/`; revisit only
  if the app genuinely outgrows Supabase AFTER the above fixes.

---

## 2026-06-10 — claude/session-continuity-setup-3sNGk

**What happened & why**
Hardened the repo on top of the continuity baton so any contributor can work safely and fast.
Added `docs/VISION.md` (core job = alignment matching; riskiest bet = data accuracy); recorded
the **backend decision** (stay on Supabase, "one front door" for data) in `PROJECT-FACTS.md`;
upgraded `ROADMAP.md` with status markers, a "don't silently rewrite" change rule, a Phase-C
code-health triage, and parked social/video for v1. Fixed an `.env` footgun (now gitignored;
added `.env.example`; only public `VITE_*` values were ever tracked — no secret exposed).
Installed **CodeGraph** (local symbol index, gitignored). Stood up the first **safety net**:
a `bun test` harness + real unit tests for `src/lib/electionUtils.ts` (the name/office/district
normalization candidate-matching depends on) + a Test job in CI. Expanded `CLAUDE.md` into a
working rulebook (reuse-first, one front door, Zod, secrets-in-env, security baseline). Added a
**review council** (`.claude/agents/`: data-accuracy, migration-safety, frontend, security) and
two **skills** (`/preflight`, `/wrap-up`).

**State** (verified)
`bun test src` → 8/8 pass. CodeGraph index healthy (494 files). `.claude/settings.json` still
valid JSON with both original SessionStart hooks intact (not modified). Agent + skill files have
valid frontmatter. NOT verified locally: full `bun run lint` / `bun run build` — they need
`bun install`, which isn't available in this container, so **CI on the PR is the authority** for
lint/build. Commits show as "Unverified" on GitHub because the env's SSH signing key is an empty
0-byte file (committer email is correct; nothing fixable here).

**Next**
Open the draft PR and let CI run lint + build + test; confirm it's green. Then return to Roadmap
priority #1 — verifying FEC/finance data accuracy (hand a sample to the `data-accuracy-verifier`).

**Deferred**
Break down oversized files (`AnswerCoveragePanel.tsx` ~3.3k, `CandidateProfile.tsx` ~1.5k).
Record the production/deployment URL in `PROJECT-FACTS.md` (still a TODO). Grow test coverage
beyond the first pure-helper module.

---

## 2026-06-08 — claude/session-continuity-setup-3sNGk

**What happened & why**
Installed a session-continuity system so any future session (human or AI) can resume without
losing context. Added three durable docs — `HANDOFF.md` (this baton), `PROJECT-FACTS.md`
(easy-to-assume-wrong facts + guardrails), `ROADMAP.md` (priorities, ranked) — plus a root
`CLAUDE.md` entry point and a SessionStart hook that auto-prints this top entry. Done because
this is a multi-contributor repo (human + Claude + Lovable bot) where cross-session context
loss and schema drift are already real, recurring problems.

**State** (verified)
Docs created and self-consistent. SessionStart hook merged into `.claude/settings.json`
alongside the existing DB-readiness probe (existing hook preserved) and prints this entry.
Not verified: no automated tests exist in this repo, so "verified" here means files reviewed +
hook output checked by hand, not a passing test suite.

**Next**
On the next real work session, follow the loop: `git fetch origin`, read this entry +
`PROJECT-FACTS.md` + `ROADMAP.md`, then start on Roadmap priority #1 — verifying FEC/finance
data accuracy.

**Deferred**
Decide whether to add a test runner (currently none). Record the production/deployment URL in
`PROJECT-FACTS.md` (still a TODO).
