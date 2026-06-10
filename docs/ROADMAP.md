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
- **2026-06-08** — created with the four ranked priorities + blockers.
- **2026-06-09** — added status markers; added Code health & cleanup section (Phase C triage);
  parked Social/AI content for v1 (per VISION); recorded `.env` safe fix as done; aligned north
  star with `docs/VISION.md` (core job = alignment matching, riskiest bet = data accuracy).
- **2026-06-10** — Priority #1 progress: the **2024 presidential independent-expenditure slice
  is verified against FEC** — sound at ticket level (~96% support / ~88% oppose; residual =
  small-item long tail), with the FF PAC ticket-ID attribution split documented as an
  intentional divergence (`docs/ie-target-reattribution.md`, `docs/HANDOFF.md` 2026-06-10).
  #1 stays 🟡: donors/committees, voting records & bills, and state finance still unverified.
- **2026-06-10 (later)** — Priority #1 progress (PR #342, merged): **duplicate candidate
  profiles eliminated** — ~35 same-person clusters (e.g. Seth Moulton as both House and Senate
  rows) merged into one profile per person (44 audited merges on Dev), with onboarding-side
  prevention (committee-based resolution + a Type E cross-state review queue) so they can't
  silently regrow. Preflight gained data-health gates (`check:data`, `check:dupes`) and the
  sitemap generator no longer ships degraded output on fetch errors. Plan + operator playbook:
  `docs/candidate-deduplication-plan.md`. #1 stays 🟡 (voting records & bills, state finance
  still unverified).
