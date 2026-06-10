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

## 2026-06-10 — data-accuracy: IE reattribution verified (claude/data-accuracy-ie-verification)

**What happened & why**
First real use of the `data-accuracy-verifier` council agent on Roadmap priority #1. Verified the
independent-expenditure (IE) target reattribution — the Biden→Harris FEC id-reuse landmine
(`P80000722`) documented in `docs/ie-target-reattribution.md` — against the **live DB**. The job
was to confirm the data is correct against source, not merely present.

**State** (verified)
Internal verification is **complete and exact** (via the app's
`candidate_independent_expenditure_totals` view + `ie_target_overrides`, project
`ornnzinjrcyigazecctf`):
- All 7 override rows present and safe — every `match_name_pattern` is paired with a specific
  `match_target_fec_candidate_id`, so no loose regex can grab the wrong person.
- Harris (`P00009423`) 2024 IE = **$1,210,981,595** (8,843 IEs); Biden (`P80000722`) =
  **$49,500,220** (980) — exact match to the doc.
- Safety holds: $0 Biden-named filings under Harris, $0 Harris-named under Biden.
- Non-destructive: 2,284 corrected rows still carry the original `P80000722` in `raw_payload`.
**NOT verified:** the external FEC absolute-truth cross-check. Blocked by this environment's
**network policy** — `api.open.fec.gov` returns `HTTP 403 "Host not in allowlist"` even with
`FEC_API_KEY` set. So this is "our correction logic is provably applied and internally
consistent," not yet "confirmed against FEC's own published figures."

**Next**
Close the external leg from a context that can reach FEC (the Supabase edge functions already
call openFEC nightly). Confirm FEC's **raw** Schedule-E `by_candidate` for 2024/president matches
our **pre-correction** figures (~$928M Harris `P00009423` / ~$332M Biden `P80000722`); the ~$283M
delta is exactly what the overrides reattribute.

**Deferred**
Enable in-session FEC checks by adding `api.open.fec.gov` to the environment network allowlist
(if the policy mode allows) OR a small read-only edge function returning `schedule_e/by_candidate`.
Then move to the next data-accuracy domain (contributions vs FEC via `finance_reconciliation`, or
voting records in `candidate_votes`). Also still open from before: oversized-file breakup,
production-URL TODO in `PROJECT-FACTS.md`, broader test coverage.

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
