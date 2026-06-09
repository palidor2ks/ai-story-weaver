# ROADMAP.md

> Where we are vs. where we're going, with blockers ranked. Read at the start of a session to
> know *what to work on*. Update when priorities shift (not every session — that's `HANDOFF.md`).
> Drafted with the maintainer 2026-06-08.

## North star for this stretch

**Ship data you can trust.** The single biggest blocker is *data accuracy/quality*, and the
definition of "done enough to ship" is *data verified accurate* — not just present. Everything
below is ordered so that trustworthy data comes first and features ride on top of it.

## Priorities (ranked)

### 1. Data accuracy — FEC/finance + voting records & bills  ⟵ top priority & the ship gate
The blocker and the definition of done both land here.
- Verify FEC donor/committee/candidate data is correct, not just loaded. Watch for ID
  mismapping (`docs/ie-target-reattribution.md`).
- Voting records & bills: confirm they reflect reality before surfacing them in the UI.
- State campaign-finance ingestion correctness (`docs/state-campaign-finance.md`).
- **Done =** the data on a given profile/page is confirmed accurate against source.

### 2. Migration / DB stability
Verified work can't land cleanly while Dev and `main` schemas drift.
- Keep Dev in sync via `scripts/apply-missing-migrations.sh` (dry-run first — guardrail #1).
- Resync playbook: `docs/dev-migration-resync.md`.
- **Done =** Dev matches `main` and the app runs clean against a fresh DB.

### 3. User-facing features
Candidates, quiz/alignment, donor & party profiles, race cards, public share pages — built on
top of data that's already verified (don't ship features over unverified data).

### 4. Social / AI content
X/TikTok posting, Remotion social cards, and the quality of AI-generated political analysis.
Highest leverage once 1–3 are solid.

## Blockers, ranked

1. **Data accuracy/quality** — the gate on shipping. Until data is verified, features built on
   it are at risk.
2. **Migration drift (Dev vs main)** — slows landing any verified change.
3. **No automated tests/CI** — "verified" currently means lint + build + manual check. **TODO:**
   decide whether to introduce a test runner.

## Out of scope / parked
- _(none recorded yet — add items here as they're deferred so they aren't silently forgotten.)_
