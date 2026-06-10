---
name: preflight
description: Run the pre-push gate for PoliPulse — lint, build, and unit tests — and report pass/fail honestly. Use before pushing or opening/updating a PR, or when the user asks to "check it's good", "run the checks", or "preflight".
---

# /preflight

Run the same gate CI runs, locally, and report the truth — don't claim green you didn't see.

## Steps
1. If `node_modules/` is missing, run `bun install` first (lint and build need deps; the unit
   tests may not, but the full gate does).
2. Run the three checks, capturing output:
   - `bun run lint`
   - `bun run test`
   - `bun run build`
3. Report a short summary table: each step → ✅ pass / ❌ fail (+ the key error lines).

## Rules
- **Be honest.** If a step couldn't run (e.g. no network for `bun install`, or a prebuild script
  needs an env var), say so explicitly and mark it ⏭️ skipped — never report it as passing.
- Lint emitting *warnings* but exiting 0 is a pass; report the warning count, don't fail on it.
- If anything fails, stop and surface the failure clearly before suggesting a fix. Don't push.
- On all-green, say so plainly and note that CI will re-run the same gate on the PR.
