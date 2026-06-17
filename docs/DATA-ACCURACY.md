# DATA-ACCURACY.md — priority #1 goals, definitions, and where we stand

> Roadmap priority #1 says "ship data you can trust" — this doc makes that **checkable**: one
> goal per data category, the exact definition being measured, where the number lives, and the
> failure threshold `bun run check:accuracy` enforces. The preflight scoreboard and the 15-minute
> `refresh_admin_stats_cache()` cron read/write the SAME `admin_stats_cache` rows — these are
> **whole-database** numbers on purpose (they track the full backlog, including states not yet
> launched).
>
> **Note (2026-06-16):** the Coverage & Finance dashboard no longer reads these cache rows
> directly for its *headline tiles* (answers, FEC, voting) **or** its candidate-scoped Data
> Accuracy Scoreboard cards (FEC reconciliation, candidate identity, URL-sourced answers). All of
> those now read `get_coverage_dashboard_stats()` (migrations `20260616120000` + `20260616180000`),
> which applies the same definitions but filtered to **visible states only** (hidden states excluded
> via `get_hidden_state_codes()`, matching `get_finance_cycle_summary`). The scoreboard's **State
> finance** card is also visible-scoped — it shows only the tracked states that are visible (NJ
> today; FL/NY are hidden), filtered client-side from the per-state cache breakdown. Only the
> **Bills** card stays whole-database (bills are national legislation and the card is a sync-health
> monitor).
>
> **Update (2026-06-16, two-state focus):** the product is now committed to visible states only —
> ingestion is gated to them (PRs gating crons/edge functions) and the public app is RLS-scoped to
> them. So the **preflight gate now measures visible states too**: `check:accuracy`'s candidate-scoped
> categories (§1 finance recon, §2 voting, §5 answers) compute the visible slice directly (joining
> `candidates` ∉ `hidden_states`), with re-baselined thresholds (below). `refresh_admin_stats_cache()`
> / `admin_stats_cache` themselves **stay whole-database** — the §0 freshness check still uses them to
> confirm the cron is alive, and they remain a whole-DB audit reference — but no visible-facing surface
> reads their candidate-scoped values anymore (dashboard uses `get_coverage_dashboard_stats`, gate
> computes directly). Net: dashboard + gate now agree on the visible slice.
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
- **Threshold:** error count must not exceed **900** (whole-DB historical; pre-two-state baseline).
- **Visible re-baseline (2026-06-16 — what the gate now enforces):** standing **39 error · 1 partial
  · 145 ok** across visible states; threshold **visible error must not exceed 100** (regression guard;
  ratchet down). The whole-DB spot-check below is retained as the methodology/audit reference.
- **Spot-check (2026-06-15, 13 candidate-cycles across AK/AL/FL/LA/CA/MS/AR/NV/TX/MS, House+Senate,
  $0.34M–$8.4M, high-dollar + grassroots):** itemized donor data reconciles to the cached FEC
  category totals **to within dollars** on every `ok` row sampled (Britt, Begich, Moody, Sullivan,
  Vindman, LaMalfa, Crawford, Guest, Brownley — 11A and 11C match, total Δ $0–$948). Vindman is the
  clean proof of the unitemized rule: $5.0M of his $8.2M is unitemized small-dollar, yet itemized
  reconciles to **$1**. The `warning` rows sampled (Lee −9.68%, Sánchez −9.35%, Hunt −8.21%) are
  genuine sub-threshold itemized gaps, correctly flagged. *Caveat:* this compares local vs the
  cached `fec_*` columns (populated from the FEC API at each recon run), i.e. **source-as-of-last-sync**,
  not a fresh FEC.gov pull (sandbox egress blocks the FEC API at 403 — re-run live from CI/local).
- **Two findings from that spot-check (open, not yet fixed):**
  1. **`status` gates only on comparable-itemized `delta_pct`, never on `total_receipts_delta_pct`**
     (`nightly-finance-reconciliation/index.ts` lines 408-411). So a row can be `ok` while total
     receipts are far off — e.g. **Bill Cassidy 2026 is `ok` with a +$2.09M / +31% total-receipts
     delta** because his itemized `delta_pct` is only −4.3%. "ok" means *donors reconcile*, not
     *total receipts reconcile* — the label is narrower than it reads. Decide whether to add a
     secondary total-receipts gate (would reclassify an unknown count of `ok` rows) or rename/scope
     the metric.
  2. **`local_other_receipts` can be inflated and inflate the total.** Cassidy's `local_other_receipts`
     is $2.55M vs FEC's $0.27M — ~the size of his $2.27M JFC transfers, which are *also* in
     `local_transfers`. The total formula's `Math.max(localOther, fecOther)` then adds the inflated
     figure. Looks like Line 14/15 "other" double-counting joint-fundraising money already counted as
     a transfer. Does **not** affect donor-facing itemized data. Audit the Line 14/15 classification
     in the FEC importer before trusting `total_receipts_delta` as a gate.
  - **Scale (2026-06-15):** of 1,746 `ok` rows, **358 (20.5%) have |total_receipts_delta| > 10%**
    and 298 > 25%; the average `ok` row is **17.7% off on total receipts**. The over/under split is
    roughly balanced (25 rows > +$500K, 21 < −$500K), which says `total_receipts_delta` is a **noisy
    two-sided metric** (over-count from the `Math.max` heuristic à la Cassidy; under-count from
    missing parent-aggregate records) — likely *why* the original author gated on comparable-itemized
    instead. **Findings A and B are linked: fix B (Line 14/15 classification + the `Math.max`
    double-count) before A (gating on total receipts) can be trusted.** The itemized gate remains the
    sound primary signal.
  - **UPDATE (2026-06-17, Finding B APPLIED + recon corrected):** migration `20260615170000` was
    applied to Dev (recorded under MCP-assigned version `20260617232826`; the repo file is idempotent
    `CREATE OR REPLACE`, so the resync script re-running it is a no-op). The 800 candidates' recon rows
    were recomputed set-based via the now-fixed `other_total` + already-stored FEC values (couldn't
    invoke the admin-only edge function from MCP; same formula, network-free). Results: **Cassidy
    total-receipts delta 31.1% → −2.6%**, `local_other_receipts` $2.55M → $274,592 (= FEC). Rows with
    the double-count signature (`local_other == local_transfers`): **138 → 0**. Excess "other":
    **$89.7M → $3.4M**, and that residual is genuine local>FEC diffs (e.g. Thanedar T000250) the
    double-count was masking — not transfers. **Finding A is now unblocked** (`total_receipts_delta`
    is trustworthy); a full nightly drain (fresh FEC fetch) will reconfirm. Original fix notes below.
  - **(2026-06-15, Finding B fix authored — migration `20260615170000`):**
    root cause found in the `other_total` column of `get_contribution_totals` /
    `get_contribution_totals_by_committee`. It was defined as the catch-all
    `line_number NOT IN ('11AI','11B','11C') AND is_contribution=true`, which (a) swept in **Line-12
    transfers** — the only non-contribution line stored `is_contribution=true` — so `local_other_receipts`
    equalled `local_transfers` and the total formula counted that money twice; and (b) the
    `is_contribution=true` filter *excluded* the genuine Line-14/15 receipts (stored `is_contribution=false`).
    Redefined `other_total = Line 14 + Line 15` (= `offset_total + other_receipts_total`, matching FEC's
    `fecOtherReceipts + fecOffsets` comparison basis). Validated vs FEC on 6 candidates: corrected local
    other lands within a few % of FEC (Graham 826,693 vs 798,798 · Krishnamoorthi 588,968 vs 604,264 ·
    Collins 89,574 vs 92,451 · Trone 599,642 vs 603,811 · Emmer 0 vs 7,733), and transfers separate
    cleanly. Thanedar (local +3.39M vs FEC **−1.83M** net other) is a real discrepancy the double-count
    was masking — now surfaced, not hidden. Recon rows correct themselves as the drain reprocesses each
    candidate. The `Math.max(localOther, fecOther)` gap-fill now operates on correct inputs; **Finding A**
    (gating on total receipts) is unblocked once a full re-drain confirms the new `total_receipts_delta`.
    - **Line-17 residual checked & closed (data-accuracy-verifier GO):** the reviewer flagged that
      Lines 17/17A/17C/18 ("Other Federal receipts", Form-3X) are dropped by `IN ('14','15')`. Within
      P/A candidate committees these total only ~$5.4M, concentrated in **2 candidates** — and including
      them makes accuracy *worse*: for every candidate that actually has Line-17 money, FEC's
      `other_receipts + offsets` is at or below the 14+15 figure (Tim Scott 2024: 14+15 $596,823 vs FEC
      $395,823, but +Line17 = **$5,892,295**; Trump 2024 +Line17 $29,134 vs FEC $0; Blake +Line17 $5,000
      vs FEC $0). FEC does not book candidate-committee Line-17 into `other_receipts`, so adding it would
      reintroduce an over-count. `IN ('14','15')` is the correct, FEC-matching definition. Verifier also
      confirmed: signature identical to the live function (no CREATE OR REPLACE drift), no `ok` row
      changes status (the gate is comparable-itemized, not total). Supabase Preview replayed the
      migration green.
- **Donor-row aggregation rule (2026-06-12):** a Schedule A line counts toward
  `donors.amount`/`transaction_count` **iff** it is not a memo line (`memo_code='X'`,
  including the importer-forced Line-12-attribution and conduit-aggregate cases), not a
  "SEE BELOW"/"EARMARKED CONTRIBUTION:" pass-through, and not under a conduit org's name
  (ActBlue/WinRed/Democracy Engine). Enforced at write time by all three importers via
  `supabase/functions/_shared/conduits.ts`; history repaired by migration
  `20260612120000` (conduit rows zeroed + flagged; memo-contaminated donor ids recomputed
  from `contributions` via a SQL replication of the donor-id hash).
  *Display policy:* conduits never appear as donors and **no aggregated conduit amount is
  shown anywhere**; earmark-program orgs (e.g. AIPAC) get ONE combined "by or through"
  entry (direct + member earmarks, breakdown stated) powered by
  `get_candidate_earmark_rollups()` — routed dollars are a labeled lens, never added to
  totals. *Verified example (E000297, Espaillat):* ActBlue 2026 donor row was
  $334,428/93 txns/`is_conduit_org=false` (stale partial sum of memo batch lines worth
  $708,925) → $0/flagged; AIPAC 2024 row was $171,360 = $10,000 direct (11C) +
  $161,360 memo-X member earmarks → $10,000, with the $161,360 surfaced as
  "earmarked through AIPAC" on the rollup entry.
  *Pre-apply review notes (2026-06-12, migration-safety GO):* the backfill's Arm 2
  deliberately keeps countable line-12 transfers in recomputed amounts — audited on prod
  (40-committee sample, 1,994 memo-contaminated groups): 0 non-contribution lines co-occur,
  and the 556 co-occurring countable transfers ($54M) are legitimate JFC transfer rows whose
  display depends on staying counted, so do NOT add an `is_transfer=false` filter. Known
  benign causes of the backfill's reported hash misses: Postgres `btrim()` strips only ASCII
  spaces while the importers' JS `.trim()` strips all Unicode whitespace (NBSP/tab names hash
  differently), and the replay guard compares pre-cast sums (fractional-sum groups rewrite to
  the same value on replay — convergent, not a bug).
- **Candidate self-funding kept out of donor lists (2026-06-13):** the candidate's own money
  must surface as *self-funding*, never as a "top donor". Two classes now excluded from
  `donors` at write time (importers) and backfilled:
    * **Line 13 loans** (and other non-11/12 receipts: 14 refunds, 15 offsets, 17 other) —
      the CSV importer previously marked every line `is_contribution=true`, so candidate
      self-loans showed as the #1 donor (e.g. McClain-Delaney $300k). Migration
      `20260613040000`.
    * **Line 11D candidate personal-funds contributions** (FEC entity "candidate", mislabeled
      "Organization" here; `local SUM(11D)` == `fec_candidate_contribution` to the dollar).
      Migration `20260613050000`. Surfaced instead via the stat card's "Self-Funded" callout
      (`fec_loans + fec_candidate_contribution`).
  Both backfills repair `donors` via the same donor-id-hash recompute as `20260612120000`.
- **BACKLOG (data-accuracy, deferred 2026-06-13): candidate self-contributions on Line 11AI.**
  Some candidates put personal funds on the *regular individual line* (11AI), not 11D — ~22
  person-name cases still show as their own top donor (e.g. Arquette $1.66M, Bauer $114k).
  A durable name-match rule was investigated and **rejected as unsafe**: committee names that
  contain the candidate's name (JFCs / victory funds — "TEAM RICK SCOTT" $7.4M, "ASHLEY MOODY
  VICTORY FUND" $3.4M; 101/128 matches were committee false positives) would be wrongly hidden
  as "self-funding", and even a refined person-name rule leaks "X FOR UTAH"-style committees.
  FEC also counts these as individual contributions (`fec_itemized`, not
  `candidate_contribution`), so they don't fold cleanly into the Self-Funded total. Needs a
  reliable candidate-entity signal (raw FEC `entity_type='CAN'` is lost at import) before this
  is safe to automate. Left as-is for now per owner.

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
- **Threshold:** syncErrors + floorSyncErrors must not exceed **350** (whole-DB historical).
- **Visible re-baseline (2026-06-16 — what the gate now enforces):** standing **0 sync errors /
  7 incomplete** across visible-state SITTING MEMBERS; threshold **must not exceed 10**. The gate
  now excludes rows with no expected record (`expected_total>0 OR expected_floor_votes>0`): the
  earlier "18 floor errors" were all **non-incumbent CANDIDATES** (challengers) carrying a
  vote_sync_status row with a spurious `floor_vote_sync_error` and 0 expected — noise, not a defect.
- **Verification finding (2026-06-16):** the underlying **`candidate_votes` data is present and rich**
  for NC/NJ sitting members (e.g. Foxx 322 sponsored / 1,868 cosponsored / 1,447 floor; Pallone
  822 / 7,184 / 1,337). But **`vote_sync_status` per-member counts are STALE/inconsistent** with
  `candidate_votes` — it shows `0/0` legislative for members who actually have thousands, and
  undercounts floor votes (Foxx vss 625 vs candidate_votes 1,447). So vote_sync_status is a
  sync-cursor/health table, NOT a source of truth for "how many votes a member has" — the dashboard
  totals correctly count `candidate_votes` directly; only the per-member completeness signal reads
  vote_sync_status. Recompute vote_sync_status from candidate_votes (or base completeness on
  candidate_votes) to make the per-member health signal honest. The 7 "incomplete" are tiny
  persisted<expected gaps (e.g. 1834/1836) — within rounding, not material.
- **Spot-verification (2026-06-16, data-accuracy-verifier):** Congress.gov egress is **403-blocked**
  from the agent sandbox (as with the FEC API) — live source diff must run from CI/local. Internal
  verification of the **visible NC/NJ** members is clean and the verdict is **GO for NC/NJ**:
  every vote row joins to a canonical `bills` row (`{congress}-TYPE.NUMBER`), **0 legacy-format
  action-type rows, 0 orphaned bill joins** (96,505 rows: 60,275 legislative + floor). Counts are
  plausible for tenure; the `(bill_id, candidate_id, action_type, vote_number)` unique constraint
  rules out duplicate inflation; and roll-call **positions** were verified for 12 members in the
  2026-06-16 PoliScore gate. **Disclosure:** floor-vote coverage is the **113th–119th Congress
  window** (~2013–present), NOT full career — a long-serving member's floor count isn't lifetime;
  frame UI accordingly (PoliScore uses curated key votes, so unaffected).
- **Caveats that DON'T affect NC/NJ (global / hidden-state):** ~25,135 legacy-format `bill_id`s
  (un-joinable to `bills`, lost topic enrichment) and the cross-congress `bill_id` collision class
  (the HR 26 Born-Alive vs Energy misattribution, fixed in `get_poliscore_record` via a date window,
  20260616163000) both live in **hidden-state** rows — the visible NC/NJ set has 0 of either. Clean
  these up before un-hiding more states.

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
- **Standing (2026-06-11, part-1b phase-1 gate): FABRICATED PROVENANCE found.** The 50-sample
  precision gate (grounded research + strict identity/claim/stance verifier; audit trail in
  `_enrich_stmt_staging`) yielded **2/44 citable** — the claimed artifacts (dated press
  releases, named interviews, verbatim quotes) mostly **do not exist**; several verdicts show
  positive fabrication evidence (real release of the claimed date covers a different topic;
  quotes matching other speakers' boilerplate). Treat `source_description` artifact claims as
  UNTRUSTED until verified — this is integrity finding #3, and it bounds what "sourced with a
  description" (totalSourced ≈ 302k) is worth. Affected class: ~15k artifact-claiming
  descriptions pool-wide (~8.9k on sitting members); the generic-prose remainder is untested
  but generated by the same model prompts. Pivot options + recommendation: plan doc §"Where
  this goes next" (owner decision pending).
- **Visible re-baseline (2026-06-16 — what the gate now enforces):** **1,819 (≈4%) of 41,688
  URL-sourced** across visible-state candidates — still RED, below the 35% floor (same bands:
  target 100% / success ≥75% / poor <35%). Rescoping to visible doesn't change the verdict (the
  low URL-sourcing is real, not a hidden-state artifact); the gate now reports the visible slice.
- **Standing (2026-06-15, preflight bucket audit):** **32,663 (5.4%) of 601,308 URL-sourced**
  — RED, below the 35% floor. Breakdown of where the gap lives, by `source_type`/`evidence_type`:
  `public_statement` 218,834 @ 0.7% URL · `other`/inferred 218,507 @ 0.9% · `campaign_website`
  79,146 @ 0.0% · **`voting_record` 64,054 @ 43.5%** (the one working route). Two structural
  facts the number reflects: (1) ~36% of all answers are `inferred` model guesses that *cannot*
  carry a URL, so they permanently cap the metric near ~64% even if everything else is perfect;
  (2) of the 217,276 URL-less `public_statement` rows, **88,473 (41%) explicitly admit no source
  exists** in their own `source_description` ("there is no publicly available information…",
  "does not detail specific positions…") — i.e. they are inferences **mislabeled** as
  `public_statement`, consistent with integrity finding #3 above. Only 380 of 218k carry an
  inline URL, and there is **no structured anchor** (no `candidate_votes`/`bills` equivalent) to
  derive one mechanically. **Cause (maintainer 2026-06-15):** these were generated by Lovable AI
  with no source-resolution step, unlike the Perplexity-grounded route. **Decision:** the
  `public_statement` backfill is **deprioritized within #1** — do not hand-triage/reclassify the
  88k now; the fix is to **re-run grounded generation via Perplexity once its quota frees up**,
  which both sources the citable answers and correctly labels the rest. Until then this category
  stays RED on purpose (same stance as Bills); the `voting_record` route remains the active one.
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
