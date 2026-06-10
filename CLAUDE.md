# CLAUDE.md

Guidance for any session — human or AI — working in this repo (PoliPulse / `ai-story-weaver`).

## Where to start (any session)

Read these, **in order**, before doing anything else:

1. **`docs/HANDOFF.md`** — the top entry is "where we left off."
2. **`docs/PROJECT-FACTS.md`** — durable facts & hard guardrails that are easy to assume wrong.
3. **`docs/ROADMAP.md`** — current priorities, ranked.
4. **`docs/VISION.md`** — who this is for and the one job it must do well (alignment matching).
   Read when a change feels like scope-creep or you're unsure what "done" means.

This is a **multi-contributor repo** (human `palidor2ks`, a Claude agent, and the Lovable
`gpt-engineer-app` bot). **Run `git fetch origin` before suggesting changes based on the main
branch — a stale clone is the #1 cause of cross-session confusion.**

## Close-out ritual (do not skip)

> **Before ending ANY session in which you changed code, config, or docs, append a new entry to
> the TOP of `docs/HANDOFF.md` using the template in that file.**

The "what & why" matters more than a file list, "State" must say what's actually verified, and
"Next" should be ONE concrete step. The SessionStart hook auto-prints the top entry, so an
accurate, current entry is what makes the next session start smart instead of blind.

## Stack & commands

- **React 18 + TypeScript + Vite 5** frontend (shadcn-ui + Tailwind, TanStack Query, React
  Router, Zod). **Supabase** backend (Postgres, edge functions, migrations).
- **Package manager: Bun.** Use `bun run <script>`:
  - `bun run dev` — dev server  ·  `bun run build` — production build  ·  `bun run lint` — `eslint .`
  - `bun run test` — `bun test src` (unit tests; see `src/**/*.test.ts`)
- **Before pushing, run `/preflight`** (lint + build + test). "Verified" = those pass + a manual
  check of the actual behavior. The test suite is young — don't claim coverage it doesn't have,
  but do add a test when you fix a bug or add a pure helper.

## Key directories

- `src/` — React app (`pages/`, `components/`, `hooks/`, `integrations/supabase/`, `context/`).
- `supabase/` — `functions/` (114 edge functions) and `migrations/` (483 SQL migrations).
- `remotion/` — separate Bun project for social-media video cards; has its own
  **`remotion/CLAUDE.md`** with Bun-runtime conventions.
- `scripts/` — sitemap generation, FEC ETL, and migration helpers.
- `docs/` — operational playbooks + the continuity docs above.

## Guardrails (full detail in `docs/PROJECT-FACTS.md`)

1. **Never auto-apply migrations** — `scripts/apply-missing-migrations.sh` is dry-run by
   default; apply deliberately. (`docs/dev-migration-resync.md`)
2. **Don't enable cron migrations without review.**
3. **Don't overwrite self-hosted candidate images** (the Trump-portrait landmine migration is
   skipped on purpose).
4. **`git fetch origin` before trusting `main`.**

## Starter rulebook (how we build here)

1. **Reuse before you build.** Check `src/hooks/`, `src/lib/`, existing components, and the
   CodeGraph index *before* writing new code. The #1 cause of mess here is re-implementing
   something that already exists.
2. **One front door for data.** Route data access through the existing layer (hooks +
   `src/integrations/supabase/`); don't sprinkle raw Supabase queries through components. This
   keeps the backend swappable (see Backend & hosting).
3. **Validate external input with Zod.** Anything from a user, an API, or a CSV is untrusted
   until parsed.
4. **All-or-nothing changes.** No half-applied migrations, no features wired to data that isn't
   there yet. If it can't land cleanly, it isn't ready.
5. **Don't build on stale `main`.** `git fetch origin` first — this is a 3-author repo.
6. **One logical change per commit**, with a message that says *why*.
7. **Secrets live in the platform env, never a committed file.** Only public `VITE_*` values
   belong in `.env` (see `.env.example`).
8. **Verify data against its source before surfacing it** (roadmap priority #1). Accurate beats
   present — and the four migration/image guardrails below are non-negotiable.

## Backend & hosting

**Decision: stay on Supabase** (Postgres + edge functions + auth). The data-heavy workload (FEC
ETL, 483 migrations, RLS) fits it well and there's no pain that a migration would fix. Keep data
access behind the one front door so the option stays open. The signal to revisit is recorded in
`docs/PROJECT-FACTS.md` — don't re-litigate it ad hoc.

## Security baseline

This app holds **user accounts and quiz/alignment responses**, so treat it as real PII:
- **RLS on every user-data table** — a new table without a policy is a leak.
- Run Supabase **advisors** (`get_advisors`) before shipping schema/policy changes.
- The `service_role` key is server-only and **never** reaches the client or a commit.
- The `VITE_SUPABASE_PUBLISHABLE_KEY` is public *by design* (RLS is what protects data) — it's
  fine in the bundle; real secrets are not.

## Code intelligence: CodeGraph

A local symbol index speeds up "where is this / what calls this / what breaks if I change it":
- `codegraph query <symbol>` · `codegraph callers <symbol>` · `codegraph impact <symbol>`
- `codegraph serve` exposes it to agents as an MCP server; `codegraph sync` after big changes.
- The `.codegraph/` index is **local + gitignored** — rebuilt per machine (`codegraph init`).

## Review council (delegate risky diffs)

Subagents in `.claude/agents/` — hand a diff to the matching reviewer before merging:
- **data-accuracy-verifier** — finance/voting data vs. source (priority #1 gate).
- **migration-safety-reviewer** — SQL migrations vs. the four guardrails.
- **frontend-reviewer** — React/TS reuse + one-front-door data access.
- **security-reviewer** — RLS, authz, secret hygiene.

## Skills (the rituals)

- **`/preflight`** — lint + build + test before you push.
- **`/wrap-up`** — walks the close-out ritual and the new HANDOFF entry.

## Conventions

- Prefer `bun` over npm/yarn/node CLIs.
- Reuse existing hooks in `src/hooks/` and existing docs in `docs/` before writing new ones.
- DB migration work requires `SUPABASE_DB_URL` set; the SessionStart probe reports readiness.
