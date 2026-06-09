# PROJECT-FACTS.md

> Durable facts that are easy to assume **wrong**. Read this at the start of every session.
> Slow-changing — update when a fact changes, not every session. Unknowns are marked `TODO`.

## What this project is

- **PoliPulse** (repo: `ai-story-weaver`) — a political-data platform: candidates, donors,
  committees, bills/voting records, AI alignment quiz, admin dashboards, and auto-generated
  social cards.
- Built originally via **Lovable** (the `gpt-engineer-app` bot is a real committer). This
  matters — see the migration guardrail below.

## Stack & commands

- **Frontend:** React 18 + TypeScript + Vite 5 (SWC plugin), shadcn-ui + Tailwind, TanStack
  Query, React Router, Zod.
- **Backend:** Supabase — PostgreSQL, 114 edge functions (`supabase/functions/`), 483
  migrations (`supabase/migrations/`).
- **Video sub-project:** `remotion/` (separate Bun project, has its own `remotion/CLAUDE.md`).
- **Package manager: Bun.** Use `bun run <script>`, not npm/yarn.
  - `bun run dev` — Vite dev server (regenerates sitemap first via `predev`)
  - `bun run build` — production build
  - `bun run lint` — `eslint .`
- **No automated test script exists** (`package.json` has no `test`). Treat "verified" as
  *lint passes + build succeeds + manual check*, not "tests pass". **TODO:** decide whether to
  add a test runner.

## Supabase coordinates (identifiers, not secrets)

- Project ID: `ornnzinjrcyigazecctf`
- Frontend env vars (values live in env, not git): `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.
- DB migration work needs `SUPABASE_DB_URL` (session pooler URI) set in the environment.
  When unset, the SessionStart readiness probe reports DB work is **blocked**. Full setup:
  `docs/dev-migration-resync.md`.

## Hard guardrails — NEVER get these wrong

1. **Never auto-apply migrations.** Use `scripts/apply-missing-migrations.sh`, which is
   **dry-run by default**. Apply deliberately, after review. (Lovable auto-applies on its side
   with timestamps 1–2s off from filenames, which is the root of the drift below.)
2. **Don't enable cron migrations without review.** ~13 cron migrations must be eyeballed
   before being turned on (`--apply --include-crons`). See `docs/dev-migration-resync.md`.
3. **Don't overwrite self-hosted candidate images.** There is a known landmine migration
   (`20260606000000_fix_trump_portrait_image`) that is deliberately skipped so it doesn't
   clobber hand-set photos. Don't "fix" it.
4. **Always `git fetch origin` before trusting `main`.** This is a multi-contributor repo
   (human `palidor2ks`, a Claude agent, the Lovable bot). A stale clone is the #1 cause of
   cross-session confusion.

## Known gotchas

- **Migration drift (Dev vs main):** the Dev Supabase project has fallen tens of migrations
  behind main because Lovable-applied and git-committed migrations diverge. Resync playbook:
  `docs/dev-migration-resync.md`.
- **Data accuracy is the current top concern** (see `ROADMAP.md`). FEC IDs have been mismapped
  before — see `docs/ie-target-reattribution.md`. State finance ingestion has its own playbook:
  `docs/state-campaign-finance.md`. Local officials import: `docs/local-officials-import.md`.

## Pointers

- Existing operational docs live in `docs/`. Prefer reading/linking them over re-deriving.
- Bun/runtime conventions for the video sub-project: `remotion/CLAUDE.md`.
- **TODO:** production URL / deployment target — not yet recorded here.
