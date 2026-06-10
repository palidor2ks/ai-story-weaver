# ROADMAP.md

> Where we are vs. where we're going, with blockers ranked. Read at the start of a session to
> know *what to work on*. Update when priorities shift (not every session — that's `HANDOFF.md`).
>
> **Status markers:** ☐ todo · 🟡 doing · ✅ done · ⏳ waiting on me · 🚀 shipped
>
> **How to change this file (don't skip):** never silently rewrite a priority. **Flip a marker**
> or **add a dated note in the Changelog** saying what changed and why — the old plan stays
> visible so we never lose *why* priorities moved. Every roadmap change is also noted in that
> session's `HANDOFF.md` entry.

## North star for this stretch

**Ship data you can trust.** The biggest blocker is *data accuracy/quality*; "done enough to
ship" = *data verified accurate*, not just present. This matches the product vision: the core
job is **alignment matching** for voters, and its riskiest assumption is that the data is
accurate (`docs/VISION.md`). Everything below is ordered so trustworthy data comes first and
features ride on top of it.

## Priorities (ranked)

### 1. 🟡 Data accuracy — FEC/finance + voting records & bills  ⟵ top priority & the ship gate
The blocker and the definition of done both land here.
- Verify FEC donor/committee/candidate data is correct, not just loaded. Watch for ID
  mismapping (`docs/ie-target-reattribution.md`).
- Voting records & bills: confirm they reflect reality before surfacing them in the UI.
- State campaign-finance ingestion correctness (`docs/state-campaign-finance.md`).
- **Done =** the data on a given profile/page is confirmed accurate against source.

### 2. 🟡 Migration / DB stability
Verified work can't land cleanly while Dev and `main` schemas drift.
- Keep Dev in sync via `scripts/apply-missing-migrations.sh` (dry-run first — guardrail #1).
- Resync playbook: `docs/dev-migration-resync.md`.
- **Done =** Dev matches `main` and the app runs clean against a fresh DB.

### 3. ☐ User-facing features
Candidates, **the alignment quiz** (the core job), donor & party profiles, race cards, public
share pages — built on top of data that's already verified (don't ship features over unverified
data).

### 4. ⏳ Social / AI content — *parked for v1 (see Out of scope)*
X/TikTok posting, Remotion social cards, AI-generated analysis. Deferred until the core
(accurate alignment matching) is solid.

## Code health & cleanup (from Phase C triage, 2026-06-09)
- ☐ **Add a minimal test harness + CI** — closes the "no automated tests" blocker. (Phase H.)
- ✅ **`.env` footgun fixed** — `.env` gitignored + `.env.example` added (only public `VITE_*`
  values were ever committed; no secret exposed). *(done 2026-06-09)*
- ☐ **Break down oversized files** (bigger job, do deliberately, don't bulldoze):
  `src/components/admin/AnswerCoveragePanel.tsx` (~3.3k lines), `src/pages/CandidateProfile.tsx`
  (~1.5k), and the large/fragile edge fns `fetch-fec-donors`, `get-candidate-answers`.
- ☐ **Consolidate data access toward "one front door"** — opportunistically route new
  Supabase access through a single layer (keeps backend swappable; see Backend decision).
- 🟡 Candidate skills to add when the pattern repeats (Phase J "rule of three"): **TODO** —
  e.g. a `/verify-candidate-data` workflow once data-checking is routine.

## Blockers, ranked
1. **Data accuracy/quality** — the gate on shipping.
2. **Migration drift (Dev vs main)** — slows landing any verified change.
3. **No automated tests/CI** — "verified" = lint + build + manual; Phase H starts fixing this.

## Out of scope / parked
- **Social auto-posting (X/TikTok) + Remotion video cards** — parked for v1 per `docs/VISION.md`
  so the core (accurate alignment matching) stays sharp. Revisit after data + match are trusted.
  *(parked 2026-06-09)*

## Changelog
- **2026-06-10** — priority #1 progress: IE target reattribution (Biden→Harris `P80000722`
  id-reuse) **verified internally exact** vs `docs/ie-target-reattribution.md` (Harris $1.21B /
  Biden $49.5M, safety + non-destructive checks pass). External FEC cross-check still open —
  blocked by the env network allowlist (`api.open.fec.gov` 403). Stays 🟡 until confirmed vs FEC.
- **2026-06-08** — created with the four ranked priorities + blockers.
- **2026-06-09** — added status markers; added Code health & cleanup section (Phase C triage);
  parked Social/AI content for v1 (per VISION); recorded `.env` safe fix as done; aligned north
  star with `docs/VISION.md` (core job = alignment matching, riskiest bet = data accuracy).
