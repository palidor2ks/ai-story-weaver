---
name: preflight
description: Run the pre-push gate for PoliPulse — lint, build, unit tests, data-source health, the data-accuracy scoreboard, and a duplicate-candidate check — then report every problem found, prioritized. Use before pushing or opening/updating a PR, or when the user asks to "check it's good", "run the checks", "where do we stand", or "preflight".
---

# /preflight

Run the same gate CI runs, plus data-health checks, and report the truth — don't claim green
you didn't see. The deliverable is a **single prioritized report of everything that needs
fixing** — including data errors (e.g. a source returning HTTP 403) — so it's clear what to
tackle first.

## Steps
1. If `node_modules/` is missing, run `bun install` first (lint and build need deps; the unit
   tests may not, but the full gate does).
2. Run the six checks, capturing output:
   - `bun run lint`
   - `bun run test`
   - `bun run build` — its prebuild sitemap step now FAILS (and keeps the last-good
     `public/sitemap.xml`) when any Supabase fetch errors; those `sitemap: ERROR fetching
     <table>: HTTP <code>` lines are data errors — collect them.
   - `bun run check:data` — probes each data source the app depends on (Supabase REST tables,
     direct DB, FEC API) and itemizes per-source status with the HTTP code.
   - `bun run check:accuracy` — the **data-accuracy scoreboard** (roadmap priority #1): per
     category (FEC reconciliation, voting records, bills, state finance, answers) reports
     where we stand vs the thresholds in `docs/DATA-ACCURACY.md`, reading the same
     `admin_stats_cache` rows the Coverage & Finance dashboard shows. **If it exits 2**
     (no `SUPABASE_DB_URL`) and the Supabase MCP is available, run the scoreboard manually:
     `select stat_key, updated_at, stat_value from admin_stats_cache` via `execute_sql`,
     apply the same thresholds, and report it as run — the numbers, not just "skipped".
   - `bun run check:dupes` — duplicate-candidate data-health check
     (`scripts/check-duplicate-candidates.sh`; read-only; needs `SUPABASE_DB_URL` + `psql`).
3. Collect EVERY problem across all six steps, then report (see below).

## Report format
Lead with a status table (one row per check → ✅ pass / ❌ fail / ⏭️ skipped, with the
headline number — error count, failing-test count, failing-probe count, untriaged-cluster count).

Then, if anything failed, a **single "Fix first" list** ordered by severity — most blocking
first — each item one actionable line with its source and location:
1. **Build errors** (push is dead in the water) — file + message.
2. **Test failures** — test name + assertion.
3. **Data-source errors** — every `[data-health] ERROR …` and `sitemap: ERROR …` line, each with
   its HTTP code (e.g. `supabase-rest candidates -> HTTP 403`). If check:data printed its
   "all failures are HTTP 403 across unrelated hosts" hint, say plainly that the cause is the
   sandbox egress policy, not the sources — and that the probes must be re-run from CI/local.
4. **Data-accuracy failures** — every `[data-accuracy] ERROR …` line (a category regressing
   past its threshold, the stats cache going stale, or the bills sync being dead). Include the
   `[data-accuracy] OK/NOTE` lines too — even when passing, this section IS the "where do we
   stand on priority #1" answer the maintainer expects from preflight.
5. **Untriaged duplicate clusters** — the `[kind] detail  members` lines from check:dupes;
   fix by triaging in `candidate_merge_map` (merge via `merge_candidate`, or `status='rejected'`
   if they're genuinely distinct people).
6. **Lint errors** (not warnings).

End with what's clean and what was skipped, so nothing looks greener than it is.

## Rules
- **Be honest.** If a step couldn't run (no network for `bun install`; `check:dupes` has no
  `SUPABASE_DB_URL` and exits 2), mark it ⏭️ **skipped** — never report it as passing.
- **Data errors are findings, not noise** — never bury a 403. But distinguish *environment*
  (sandbox egress blocks everything → fix is "re-run with network") from *real* data errors
  (one source failing while others pass → fix is in that source/key/RLS).
- **Never commit a degraded `public/sitemap.xml`.** If the working tree shows a sitemap diff
  after a build in a network-restricted env, revert it — the generator now avoids writing one,
  but belt-and-braces.
- Lint emitting *warnings* but exiting 0 is a pass; report the warning count, don't fail on it.
- `check:dupes` exit codes: `0` clean (or only already-triaged clusters), `1` untriaged
  duplicates found → ❌ fail and list them, `2` skipped (no DB) → ⏭️.
- `check:accuracy` exit codes mirror that: `0` within thresholds, `1` failing categories,
  `2` skipped — but a skip is recoverable via Supabase MCP (see Steps); prefer recovering it
  over reporting ⏭️, since priority #1 status is the report's most important content.
- Report the FULL picture before suggesting fixes, and don't push while anything is ❌ for a
  non-environment reason.
- On all-green (skips noted), say so plainly and note CI re-runs lint/test/build on the PR
  (CI does not run check:data/check:dupes — they need network/DB — so those are local/Dev gates).
