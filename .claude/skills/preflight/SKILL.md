---
name: preflight
description: Run the pre-push gate for PoliPulse — lint, build, unit tests, and a duplicate-candidate data-health check — then report every problem found, prioritized. Use before pushing or opening/updating a PR, or when the user asks to "check it's good", "run the checks", or "preflight".
---

# /preflight

Run the same gate CI runs, plus a data-health check, and report the truth — don't claim green
you didn't see. The deliverable is a **single prioritized report of everything that needs
fixing**, so it's clear what to tackle first.

## Steps
1. If `node_modules/` is missing, run `bun install` first (lint and build need deps; the unit
   tests may not, but the full gate does).
2. Run the four checks, capturing output:
   - `bun run lint`
   - `bun run test`
   - `bun run build`
   - `bun run check:dupes` — duplicate-candidate data-health check
     (`scripts/check-duplicate-candidates.sh`; read-only; needs `SUPABASE_DB_URL` + `psql`).
3. Collect EVERY problem across all four steps, then report (see below).

## Report format
Lead with a status table (one row per check → ✅ pass / ❌ fail / ⏭️ skipped, with the
headline number — error count, failing-test count, untriaged-cluster count).

Then, if anything failed, a **single "Fix first" list** ordered by severity — most blocking
first — each item one actionable line with its source and location:
1. **Build errors** (push is dead in the water) — file + message.
2. **Test failures** — test name + assertion.
3. **Untriaged duplicate clusters** — the `[kind] detail  members` lines from the dupe check;
   fix by triaging in `candidate_merge_map` (merge via `merge_candidate`, or `status='rejected'`
   if they're genuinely distinct people).
4. **Lint errors** (not warnings).

End with what's clean and what was skipped, so nothing looks greener than it is.

## Rules
- **Be honest.** If a step couldn't run (no network for `bun install`; a prebuild script needs an
  env var; `check:dupes` has no `SUPABASE_DB_URL` and exits 2), mark it ⏭️ **skipped** — never
  report it as passing. The dupe check skipping is normal locally/in CI; call it out, don't fail.
- Lint emitting *warnings* but exiting 0 is a pass; report the warning count, don't fail on it.
- `check:dupes` exit codes: `0` clean (or only already-triaged clusters), `1` untriaged
  duplicates found → ❌ fail and list them, `2` skipped (no DB) → ⏭️.
- Report the FULL picture before suggesting fixes, and don't push while anything is ❌.
- On all-green (skips noted), say so plainly and note CI re-runs lint/test/build on the PR
  (CI does not run the dupe check — it has no DB — so that one is a local/Dev gate).
