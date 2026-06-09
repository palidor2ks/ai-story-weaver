# CLAUDE.md

Guidance for any session — human or AI — working in this repo (PoliPulse / `ai-story-weaver`).

## Where to start (any session)

Read these three, **in order**, before doing anything else:

1. **`docs/HANDOFF.md`** — the top entry is "where we left off."
2. **`docs/PROJECT-FACTS.md`** — durable facts & hard guardrails that are easy to assume wrong.
3. **`docs/ROADMAP.md`** — current priorities, ranked.

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
- **No test script exists.** "Verified" = lint passes + build succeeds + manual check. Don't
  claim tests pass.

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

## Conventions

- Prefer `bun` over npm/yarn/node CLIs.
- Reuse existing hooks in `src/hooks/` and existing docs in `docs/` before writing new ones.
- DB migration work requires `SUPABASE_DB_URL` set; the SessionStart probe reports readiness.
