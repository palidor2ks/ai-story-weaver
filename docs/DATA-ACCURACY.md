# DATA-ACCURACY.md — priority #1 goals, definitions, and where we stand

> Roadmap priority #1 says "ship data you can trust" — this doc makes that **checkable**: one
> goal per data category, the exact definition being measured, where the number lives, and the
> failure threshold `bun run check:accuracy` enforces. The Coverage & Finance dashboard
> (admin), the preflight scoreboard, and the 15-minute `refresh_admin_stats_cache()` cron all
> read/write the SAME `admin_stats_cache` rows — one set of numbers, three surfaces.
>
> Standing numbers below were measured **2026-06-10** (live DB). Update them when a category
> materially moves, and ratchet thresholds DOWN as backlogs are fixed — never up without a
> dated note here.

## How freshness works (the automation)

- `refresh_admin_stats_cache(p_keys)` (migration `20260610170000`) recomputes every category
  server-side; **pg_cron runs it every 15 min**, and the dashboard's refresh buttons call the
  same function via the `refresh-admin-stats` edge function. Ingestion drains run every 3–10
  min, so stats are at most ~one cron cycle behind "after each update of data".
- If any cache row is older than **2 hours**, `check:accuracy` FAILS — that means the
  automation itself broke, which is itself a data problem.
- Before this existed, the dashboard read cache rows refreshed only by hand: votes had been
  stale since 2026-01-19 (the edge fn depended on a `vote_action_counts` materialized view
  that doesn't exist in prod — migration drift), FEC/answers ~13 days.

## The categories

### 1. Federal finance (FEC) — `finance_recon_stats`
- **Goal:** every surfaced candidate-cycle's receipts agree with FEC within the reconciliation
  rules (`finance_reconciliation` status `ok`), and IE spending is attributed to the right
  person (`docs/ie-target-reattribution.md`).
- **Measured as:** `finance_reconciliation` status counts + `errorGapUsd` (sum of
  total-receipts deltas on `error` rows). Recon rows are written by the FEC drain pipeline
  (`drain-fec-finance` cron, every 10 min) — the *checking* is already automated; the
  *backlog* is the work.
- **Standing (2026-06-10):** 1,847 ok · 59 warning · 179 partial · **777 error**. The 2024
  presidential IE slice is verified (ROADMAP changelog 2026-06-10); donors/committees remain
  the open front.
- **Threshold:** error count must not exceed **900** (regression guard; ratchet down).

### 2. Voting records — `voting_records_stats`
- **Goal:** every sitting federal legislator's sponsored/cosponsored/floor-vote record is
  complete vs Congress.gov expectations (`expected_*` vs `persisted_*` in `vote_sync_status`).
- **Measured as:** member `syncErrors` + `floorSyncErrors`, `incompleteMembers`
  (persisted < expected). Sync itself is automated (`sync-legislator-votes` cron, 15 min).
- **Standing (2026-06-10):** 2,419 members tracked · 36 sync errors · 233 floor-vote errors ·
  270 members with incomplete bill-vote sets. 1.51M vote rows.
- **Standing (2026-06-11, post repair re-run):** legacy sponsorship bill-ids 429,886 → 25,135
  (94% cleared) and **251,775 stranded legacy duplicates deleted**, so `legislativeActions`
  (1.02M, previously an inflated 1.26M) is now trustworthy. 24+233 sync errors · 188 incomplete.
- **Threshold:** syncErrors + floorSyncErrors must not exceed **350**.
- **Spot-verification** (counts ≠ correctness): use the `data-accuracy-verifier` agent to
  diff sample members against Congress.gov — not yet done systematically. TODO: pick 10
  members/chamber and record the result here.

### 3. Bills — `bills_stats`
- **Goal:** the bills corpus tracks Congress.gov continuously (nightly), so positions/votes
  surfaced against bills aren't stale.
- **Measured as:** days since `bill_sync_status.last_sync_completed_at` (sync_type `nightly`).
- **Standing (2026-06-10):** 31,321 bills / 86,292 sponsor links — but the nightly sync
  **last completed 2026-01-13 (≈5 months dead)**. Nothing schedules it: `nightly-bill-sync`
  requires an admin user JWT, so no pg_cron entry can call it as-is.
- **Standing (2026-06-11):** revival + catch-up grew the corpus to **154,930 bills across
  congresses 108–119** (canonical `{congress}-TYPE.NUMBER` ids); nightly sync alive (0d stale).
  Per-congress totals look plausible but are **not yet verified against Congress.gov** — TODO.
- **Threshold:** staleDays > **7** FAILS (currently failing, deliberately — it stays red
  until the sync is revived).
- **Fix (maintainer approved 2026-06-10):** `nightly-bill-sync` now accepts the vault
  shared-secret path (`check_bill_sync_secret`, migration `20260610180000`) and runs
  nightly at 03:10 UTC via pg_net; the secret value lives only in Vault
  (`bill_sync_secret`). A manual catch-up run covering the 2026-01-13 → now gap was kicked
  at revival time.

### 4. State campaign finance (NJ / FL / NY) — `state_finance_stats`
- **Goal:** each ingested state's contributions keep flowing (per-state drains stay
  error-free), per `docs/state-campaign-finance.md`; portal-total reconciliation per state is
  the next accuracy step (not yet measured — TODO, mirror the FEC recon pattern).
- **Standing (2026-06-10):** NJ 79,750 / FL 270,182 / NY 561,847 contributions; all three
  synced today; 0 errors in 7 days.
- **Threshold:** any sync errors in the last 7 days FAIL.

### 5. Candidate answers / positions — `candidate_answer_stats`
- **Goal (proposed — confirm with maintainer):** every answer that feeds alignment matching
  carries a checkable source, where "sourced" should mean a **source URL**, not just a
  description. VISION.md names positions as part of the riskiest assumption, but ROADMAP #1
  didn't list answers until 2026-06-10 — closing that gap is why this category exists.
- **Measured as:** `totalSourced` (dashboard's historical definition: substantive
  `source_description`, excluding platform-derived/inferred) AND `sourcedWithUrl` (strict:
  `source_url`/`source_urls` present). Both are reported because they differ wildly.
- **Standing (2026-06-10):** 382,845 answers across 1,969 candidates ·
  ~82% description-sourced · **only ~5.9% (22,487) URL-sourced** · 0 rows use the
  `has_discrepancy` flag (the discrepancy machinery exists but nothing populates it).
- **Standing (2026-06-10, post enrichment part 1):** 401,683 answers ·
  **25,997 (6.47%) URL-sourced** after the vote-derived citation pipeline
  (`scripts/answers-enrichment/`) attached 3,309 mechanically verified citations
  (member sponsor/cosponsor actions, sign- and congress-consistency guarded).
  The vote-citation route's remaining ceiling is ~27k eligible answers; crossing
  35% needs the other source types (see part-1b options in HANDOFF).
- **Standing (2026-06-11, post repair re-run + round 3):** the `candidate_votes` repair re-run
  lifted congress-consistent evidence to 1,213,567 pairs / 541 members; round 3 enriched
  **+934 answers** (151 tier-1 / 783 tier-2). A full-staging audit of all 803 keyword↔bill
  titles caught a new poison class — proclamation/awareness weeks and title puns ("Head Start
  on Vaccinations", "National Park*inson's*") — now excluded in the generator.
  **27,578 (6.26%) of 440,326 URL-sourced.** Mind the **dilution dynamic**: the regular
  pipeline adds ~30k description-sourced answers/day, so the % can drop between enrichment
  rounds even as the URL-sourced count grows. *(Maintainer 2026-06-11: dilution accepted —
  no throttle; see ROADMAP changelog.)*
- **Standing (2026-06-11, hygiene — integrity finding #2 closed):** **47,066** answers
  labeled `voting_record` for candidates with **zero** `candidate_votes` rows (sampling:
  party-affiliation inferences, incl. wrong-person research) relabeled to
  `evidence_type='inferred'` / `source_type='other'`. `voting_record` without URL is now
  **36,282, all with real vote data** (the honest vote-citation pool). Regrowth stopped at
  write time by `_shared/answer-label-guard.ts` in `get-candidate-answers`. ~5.2k relabeled
  rows belong to 161 **orphaned candidate_ids** (no candidates row) — separate repoint task.
  **Next route: part 1b** (research-pipeline citations) — `docs/answers-enrichment-part1b-plan.md`.
- **Goal (set by maintainer 2026-06-10):** URL-sourced answers — **target 100%**,
  **≥75% = success**, **<35% = poor/failing**. `check:accuracy` FAILS below 35%, warns
  below 75%. We are at ~5.9%, so this category is RED on purpose until the enrichment
  pipeline closes the gap — same "stays red until fixed" stance as Bills.

### 6. Candidate identity — `identity_stats` + `check:dupes`
- **Goal:** one profile per person; merges audited.
- **Standing (2026-06-10):** 2,384 candidates · 4,000 persons · 44 audited merges · 0
  untriaged duplicate clusters (gated separately by `bun run check:dupes` since PR #342).
- **Threshold:** any untriaged cluster fails preflight (via check:dupes).

## Categories deliberately NOT yet gated

- **Party platforms** — `party_platforms` has **0 rows** in prod while the app/sitemap
  reference it; decide whether it's vestigial or needs ingestion before inventing a goal.
- **Polls, elections/races, news** — surfaced but low-risk for the core alignment job;
  revisit after the six above are green.

## Where this gets checked

| Surface | What | When |
| --- | --- | --- |
| `refresh_admin_stats_cache()` | recomputes all category stats | pg_cron, every 15 min |
| Coverage & Finance dashboard | tiles + Data Accuracy Scoreboard section | on view (cache ≤15 min old) |
| `bun run check:accuracy` | thresholds above, itemized | every `/preflight` |
| `data-accuracy-verifier` agent | row-level source spot-checks | on demand, before surfacing new data |
