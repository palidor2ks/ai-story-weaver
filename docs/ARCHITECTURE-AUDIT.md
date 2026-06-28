# Architecture Audit & Refactoring Roadmap

> **Status:** Written audit only — **no functionality changed, no code refactored yet.**
> Produced 2026-06-28 on branch `claude/image-prompt-implementation-navk5j`.
> Approach: reverse-engineer the architecture and data flow, then identify bad
> architecture, duplicate logic, performance bottlenecks, scalability risks, and
> maintainability issues — and propose a ranked, all-or-nothing-safe path to
> production-grade quality **without changing behavior**.
>
> Every claim below is backed by a number you can reproduce with the commands in
> the **Appendix**. Treat this as a prioritization tool, not a mandate.

---

## 1. Clean architecture breakdown (as-is)

### Frontend — React 18 + Vite 5 + TypeScript (~85k LOC in `src/`)

```
pages/ (49 route screens, lazy-loaded in App.tsx)
  └─ components/ (186: feature components + admin/ + shadcn ui/)
       └─ hooks/ (79 TanStack Query hooks)        ← intended data layer
            └─ integrations/supabase/client.ts    ← single shared client
                 └─ Supabase (Postgres + RLS)
  src/lib/    — pure, framework-free logic (scoring, formatting, finance math)
  src/context — AuthContext, UserContext (cross-cutting app state)
```

- **Routing/data flow:** `App.tsx` lazy-loads every page and wires providers
  (`QueryClientProvider` → `AuthProvider` → `UserProvider`) plus a class
  `ErrorBoundary`. Good: code-splitting per route, central provider tree.
- **Read path (intended):** Component → query hook (`useCandidates`, etc.) →
  `supabase` client → RLS-protected tables. TanStack Query owns caching/refetch.
- **Quiz/alignment path:** answers → `src/lib/scoring.ts` (pure) → match results.
  Keeping scoring pure is the single best architectural decision in the repo —
  it's testable (`scoring.test.ts`) and runtime-agnostic.

### Backend — Supabase (Deno edge functions + SQL)

```
supabase/functions/        — 132 edge functions (ETL, AI enrichment, social, email)
  └─ _shared/              — shared Deno modules (district-resolver, finance-caption,
                             onboard-candidate, social-card, gemini-research, …)
supabase/migrations/       — 561 SQL migrations
scripts/                   — sitemap gen, FEC ETL helpers, data-health checks
remotion/                  — separate Bun project for social video cards
```

- **Write path:** cron-triggered ETL/AI functions enrich data (FEC donors, floor
  votes, bills, candidate answers) and write back; the frontend only reads.
- **Heaviest functions:** `fetch-fec-donors` (1,834 LOC), `fetch-civic-officials`
  (1,422), `get-candidate-answers` (1,179), `fetch-floor-votes` (1,056).

### What's genuinely good (keep, don't "fix")

- Pure-logic isolation in `src/lib/` with unit tests.
- Per-route lazy loading + a real `ErrorBoundary` in `App.tsx`.
- A single typed Supabase client; generated `types.ts` gives end-to-end types.
- Shared edge logic is factored into `_shared/` with tests
  (`answer-source-audit`, `finance-caption`, `onboard-candidate`, …).
- The hooks layer, *where used*, is a clean TanStack Query front door.

---

## 2. Critical problem areas

Ranked by blast radius. Severity = (how much it hurts) × (how much it spreads).

### 🔴 P1 — "One front door for data" is widely broken (bad architecture + scalability)

`CLAUDE.md` rule #2 says route all data access through hooks +
`integrations/supabase/`. Reality:

- **67 component/page files import the Supabase client directly.**
- **201 raw `.from(...)` queries live in `components/` and `pages/`.**
- **26 components fetch via `useEffect`+`useState`+`supabase`** instead of a
  query hook — re-implementing caching/loading/error handling by hand, 26 times.
- Components also call **`supabase.functions.invoke(...)` directly** (e.g.
  `BillSummaryDashboard.tsx` ×10, `SocialPosts.tsx` ×6).

**Worst offenders (raw `.from()` count):**

| File | `.from()` calls |
|---|---|
| `components/admin/CommitteeAliasesPanel.tsx` | 17 |
| `pages/DonorProfile.tsx` | 15 |
| `components/admin/QuestionManagementPanel.tsx` | 15 |
| `pages/TopSpenders.tsx` | 12 |
| `pages/admin/SocialPosts.tsx` | 10 |
| `components/admin/TopicReviewPanel.tsx` | 7 |
| `components/admin/DonorImportPanel.tsx` | 7 |
| `components/ComparePanel.tsx` | 7 |
| `pages/CandidateProfile.tsx` | 6 |

**Why it matters:** the backend is no longer swappable (a stated strategic goal in
`CLAUDE.md` → "Backend & hosting"); query logic, column names, and RLS assumptions
are scattered across the UI; caching is inconsistent (some data cached by Query,
some refetched on every mount); and there's no single place to add Zod validation
of returned rows. This is the biggest scalability/maintainability tax in the repo.

### 🟠 P2 — Cross-runtime duplicated modules, only partially guarded (duplicate logic)

> **Correction (2026-06-28, after reading the files in full):** an earlier draft of
> this audit listed this as P1 and claimed *both* duplicated modules had silently
> drifted. That was based on a crude `diff`/export-list comparison and overstated
> the risk. The accurate picture is below; the one genuine gap has since been
> closed (see "Resolved").

Two concerns are duplicated across `src/lib/` and `supabase/functions/_shared/`
because Vite and Deno can't share a module without a build step:

- **`candidateName.ts` — NOT actually drifting.** The two copies are byte-identical
  in logic; the only difference is a frontend-only `toDisplayName` alias (the edge
  runtime doesn't need it). Crucially, `src/lib/candidateName.test.ts` already
  contains a **drift guard** that imports *both* copies and asserts identical output
  across a shared fixture table — so CI fails if they ever diverge. This is the
  pattern to copy, not a problem to fix.
- **`conduits.ts` — genuinely two different modules** that happen to share a name.
  The frontend copy (`CONDUIT_NAMES` + `isConduitName` + `isConduitDonor`) is for
  donor *display*; the edge copy (`KNOWN_CONDUITS` + `isKnownConduitOrg` + memo /
  "EARMARKED" / "SEE BELOW" rules + `shouldCountDonorLine`) is for FEC
  *aggregation*. Each has its own test file. The real gap was the **shared
  conduit-org name list**: it lived in both files with no test locking them
  together, so adding a new processor to one list would silently skip the other —
  the UI could hide a donor the ETL still counts (or vice-versa).

**Resolved (this branch):** added a drift-guard test in `src/lib/conduits.test.ts`
(mirroring `candidateName.test.ts`) asserting `CONDUIT_NAMES` and `KNOWN_CONDUITS`
cover the same set and that `isConduitName`/`isKnownConduitOrg` agree across a
fixture set. Sync comments in both files now point to that test instead of relying
on a manual "keep in sync" note. **No logic changed.**

**Remaining principle:** any *new* cross-runtime copy should ship with a drift
guard like these two, rather than a hand-sync comment no tooling enforces.

### 🟠 P2 — God-files (maintainability + review risk + render performance)

Single files concentrating too much responsibility — hard to test, hard to review,
and (for components) a re-render of the whole tree on any state change:

| File | LOC |
|---|---|
| `components/admin/AnswerCoveragePanel.tsx` | 3,530 |
| `components/admin/QuestionManagementPanel.tsx` | 1,442 |
| `pages/DonorProfile.tsx` | 1,240 |
| `hooks/useFECIntegration.ts` | 1,194 |
| `components/admin/BillSummaryDashboard.tsx` | 1,113 |
| `hooks/useCandidatesAnswerCoverage.ts` | 1,070 |
| `pages/UserProfile.tsx` | 1,065 |
| `supabase/functions/fetch-fec-donors/index.ts` | 1,834 |

A 3,500-line React component cannot be meaningfully unit-tested and forces every
reviewer to hold the whole thing in their head — exactly the "easy to assume wrong"
trap `CLAUDE.md` warns about.

### 🟠 P2 — Performance & scalability hotspots

- **Manual fetch components** (the 26 `useEffect`+`supabase` files) miss Query's
  dedupe/cache/stale handling → redundant network calls and broad re-renders on
  query-heavy admin/profile/donor screens.
- **Direct `functions.invoke` from render-path components** couples UI latency to
  long-running edge functions with no shared retry/caching policy.
- **Largest edge functions** (1.8k LOC ETL) mix fetch + transform + write +
  pagination in one file, making timeout/idempotency/resume behavior hard to reason
  about (cross-check with `etl-pipeline-reviewer` before any change).

### 🟡 P3 — Maintainability hygiene

- **259 `console.*` calls** in non-test `src/` code — no leveled/structured logging;
  noisy in prod and a minor PII-leak surface for a PII app.
- **46 `: any` annotations** in `src/` — type-safety holes, mostly reachable around
  the manual-fetch components where row types aren't inferred from the client.
- "Keep in sync" comments instead of enforced shared contracts (see P1 duplication).

---

## 3. Refactoring strategies (ranked roadmap)

Each item is scoped to land as **one logical, behavior-preserving commit** with the
matching reviewer from `CLAUDE.md`'s council. Ordered by ROI-to-risk.

### Step 1 — Converge the drifted shared modules *(small, safe, high-value)*
- Make `_shared/conduits.ts` and `src/lib/conduits.ts` (and the two
  `candidateName.ts`) **derive from one canonical definition**: keep a single
  source-of-truth file (the name list + pure helpers) and have each runtime copy
  re-export it, or generate the Deno copy from the Vite copy at build time so the
  list/logic literally cannot drift.
- Reconcile the two conduit name lists and export names into one API; add a unit
  test asserting both runtimes resolve identical results for a fixed input set.
- **Risk:** low. **Behavior change:** none (converge to current correct values;
  confirm with `data-accuracy-verifier` since conduit rules gate donor dollars).
- **Reviewer:** `data-accuracy-verifier` + `content-provenance-reviewer`.

### Step 2 — Establish the data front door, then migrate offenders page-by-page
- Add (or document) the convention: every table read goes through a hook in
  `src/hooks/` returning typed, Zod-validated rows; no `.from()` or
  `functions.invoke` in `components/`/`pages/`.
- Migrate the **worst offenders first** (`CommitteeAliasesPanel`, `DonorProfile`,
  `QuestionManagementPanel`, `TopSpenders`, `SocialPosts`) — one file per commit —
  by extracting their queries into dedicated hooks. Net effect: consistent caching,
  fewer redundant fetches, one place for validation, backend stays swappable.
- Add a lint guard (eslint `no-restricted-imports`/`no-restricted-syntax`) to stop
  **new** raw queries from entering `components/`/`pages/` so the number can only
  go down. This is the single highest-leverage scalability fix.
- **Risk:** medium (touches many files), but each commit is small and verifiable.
- **Reviewer:** `frontend-reviewer` (+ `performance-bundle-reviewer` for the
  query-heavy screens).

### Step 3 — Decompose god-files behind stable public APIs
- Split the largest components into a thin container + focused subcomponents +
  extracted hooks, keeping the **same exported component name and props** so callers
  don't change. Start with `AnswerCoveragePanel.tsx` (3,530 LOC) and
  `DonorProfile.tsx` (1,240 LOC).
- For `fetch-fec-donors` (1,834 LOC), extract pure transform helpers into
  `_shared/` with tests; leave the orchestration/IO shell thin.
- **Risk:** medium; mitigated by "same public surface, pure-extraction-only."
- **Reviewer:** `frontend-reviewer` / `etl-pipeline-reviewer`.

### Step 4 — Logging & type hygiene *(low-risk cleanup)*
- Introduce a tiny logger wrapper (level + env gate) and replace bare `console.*`;
  strip debug logs from render paths.
- Burn down `: any` starting with the files touched in Steps 2–3 (types come "for
  free" once reads go through typed hooks).
- **Reviewer:** `frontend-reviewer` (+ `security-reviewer` for any log touching PII).

### Guardrails for every step (non-negotiable)
- **Do not change functionality** — pure structure/quality only.
- One logical change per commit; run `/preflight` (lint + build + test) before each
  push; add a test whenever a pure helper is extracted.
- `git fetch origin` first (3-author repo); never auto-apply migrations.
- Route each diff to the **one** matching reviewer, scoped to the diff (quota
  discipline).

---

## 4. Production-grade code recommendations (targets, not yet applied)

- **Data access:** a typed hook + Zod schema per table read; lint rule banning raw
  client use outside `hooks/`/`integrations/`.
- **Shared logic:** one canonical module per concern; cross-runtime copies generated
  or re-exported, never hand-synced; a test that fails if they diverge.
- **Components:** soft cap (~400 LOC) enforced by review; containers stay thin,
  logic lives in hooks, presentational pieces are pure and memoizable.
- **Observability:** leveled logger; no `console.*` in shipped paths; never log PII.
- **ETL functions:** pure transforms extracted and unit-tested; IO shells kept thin
  with explicit pagination/idempotency/resume.

---

## 5. Progress & suggested next action

- **Step 1 — DONE (this branch).** Added the missing conduit-list drift guard
  (`src/lib/conduits.test.ts`) + sync-comment fixes; confirmed `candidateName.ts`
  was already drift-guarded and needed no change. No functionality changed.
- **Next: Step 2** — establish the data front door and migrate the worst offenders
  one file per commit (`CommitteeAliasesPanel`, `DonorProfile`,
  `QuestionManagementPanel`, …), plus an eslint guard so new raw queries can't enter
  `components/`/`pages/`. This is the highest-leverage scalability fix; route to
  `frontend-reviewer`.

---

## Appendix — reproduce the evidence

```bash
# P1: front-door violations
grep -rl "from ['\"]@/integrations/supabase/client" src/components src/pages | wc -l   # 67
grep -rn "\.from(" src/components src/pages | wc -l                                       # 201
grep -rl "useEffect" src/components src/pages | xargs grep -l "supabase" | wc -l          # 26
grep -rc "\.from(" src/components src/pages | grep -v ":0" | sort -t: -k2 -rn | head      # offenders

# P1: drifted duplicates
diff src/lib/conduits.ts supabase/functions/_shared/conduits.ts                            # differ
diff src/lib/candidateName.ts supabase/functions/_shared/candidateName.ts                  # differ

# P2: god-files
find src -name '*.tsx' -o -name '*.ts' | xargs wc -l | sort -rn | head -20

# P3: hygiene
grep -rn "console\.\(log\|error\|warn\)" src --include=*.ts --include=*.tsx | grep -v test | wc -l  # 259
grep -rn ": any" src --include=*.ts --include=*.tsx | wc -l                                           # 46
```
