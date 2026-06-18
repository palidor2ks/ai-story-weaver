# OPEN-WORK.md

> **The actionable backlog.** A prioritized, plain-language list of outstanding work — each item
> says *what it is*, *how it came up (history)*, and *current state*. `/preflight` surfaces this
> at the end of its report, so keep it current: when you finish an item, mark it ✅ with a date
> (or delete it); when a session uncovers new work, add it here AND note it in `docs/HANDOFF.md`.
>
> Scope split: **`ROADMAP.md`** = strategic priorities & the ship gate · **`HANDOFF.md`** =
> session-by-session log · **this file** = the consolidated to-do the maintainer works from.
>
> Status markers: ☐ todo · 🟡 in progress · ✅ done (keep ~2 weeks then prune) · ⛔ blocked

---

## 🔴 Data quality (the ship gate — top priority)

### 1. ☐ Remaining `public_statement` corroboration — ambiguous half
**What:** ~3,945 visible-state `public_statement` rows with no source URL that lack a quote/outlet/.gov
cue. Run through `corroborate-answers` (explicit `question_ids` per candidate) to find real sources.
**History:** Sourceless `public_statement` pool was 16,723 → relabeled 8,140 obvious inferences →
corroborated the 4,638 high-signal rows (535 sourced, 14.6% hit) → relabeled the 3,615 "insufficient".
These ambiguous rows are the untouched remainder.
**State:** Not started. ~$31 external (Perplexity) spend. Lower expected yield (no source cue).

### 2. ⛔→☐ Opposite-sign / contradict review pool (do NOT auto-apply)
**What:** ~440 rows where an LLM source disagrees with the recorded value: ~190 non-marquee contradicts
(June rollouts) + 115 opposite-sign "supports" + 27 zero + 109 contradicts (`rollout-ps-2026-06-17`).
**History:** The contradict pass proved the LLM's `source_value` is ~50% inverted vs. its own quote, so
bulk-flipping corrupts correct values. Only the 31 hand-reviewed marquee corrections were applied.
**State:** Deferred — per-row human review only. Most are unscored `inferred` (low impact). Revisit if a
specific candidate's displayed stances are flagged wrong.

### 3. ✅ FEC recon — Line 14/15 "other receipts" double-count (Finding B) — done 2026-06-17
**What:** `local_other_receipts` double-counted JFC money already in `local_transfers`, inflating
`total_receipts_delta`. **Fixed:** migration `20260615170000` applied (redefines `other_total` =
Line 14+15); 800 recon rows recomputed. Double-count signature rows **138 → 0**; Cassidy delta
31.1% → −2.6%. Details in `docs/DATA-ACCURACY.md §1`.

### 4. ✅ FEC recon — total-receipts completeness signal (Finding A) — done 2026-06-18 (deployed)
**What:** `status` answers itemized accuracy only; ~363 `ok` rows were materially off on TOTAL
receipts (mostly coverage gaps). **Done (2026-06-17):** chose "separate completeness metric" —
added `finance_reconciliation.total_receipts_status` (ok/under/over), computed at all 3 write sites
(nightly-finance-reconciliation + 2 in refresh-fec-totals), backfilled (1,655 ok / 865 under /
212 over / 148 n/a), surfaced on `FinanceReconciliationCard`. `status` semantics unchanged.
**State:** code merged (PR #451) + migration applied + backfilled. Edge functions **deployed to prod
2026-06-18** by `deploy-edge-functions.yml` on the #451 merge (run succeeded) — future runs now
populate the column on new rows. A full nightly drain (fresh FEC fetch) will also refresh deltas.

### 5. ✅ Congress donor backfill stall — done 2026-06-18 (deployed)
**What:** ~163 `candidate_committees` rows with `has_more=true` weren't progressing (~3/day vs 144/day
theoretical, cron `*/10`).
**Diagnosis (2026-06-17):** ~94% by design — of ~120 never-completed stalled committees, **113 are
tier_1 but hidden-state** (correctly excluded by the visible-states gate; do NOT widen scope — that
contradicts the product focus and worsens disk pressure #6). Only **1 visible candidate** (Deborah
Ross, NC Senate) was genuinely stuck. **Root cause:** `schedule-congress-donor-sync` fetched the
first `limit*100=100` stalled rows ordered by `created_at` and filtered to visible/tier_1 *after* the
limit — Ross sat at rank ~115 behind 114 hidden rows, so the filter yielded 0 every run.
**Fix:** scope-first selection (resolve in-scope candidate ids, THEN find their stalled committees).
**State:** code merged (PR #451) + **deployed to prod 2026-06-18** (same workflow run). The next
`*/10` cron run picks up Ross. Worth a spot-check that her backfill actually advances over the next
day (still can't manually trigger fetch-fec-donors from MCP — admin auth + FEC network).

---

## 🟠 Infrastructure / DB

### 6. 🟡 Supabase disk pressure — reclaimed ~2.36 GB (15→13 GB); owner-level fix still open
**What:** DB was ~15 GB; `refresh-donor-consolidated-daily` OOM'd 2026-06-13 (matview refresh needs 2× temp).
**Done (2026-06-18):** dropped orphaned `_enrich_*` staging (~506 MB, migration `20260618120000`) AND
9 unused `idx_scan=0` indexes (~1.86 GB, migration `20260618130000`, reviewer GO). **DB 15 → 13 GB**
(contributions 8,473→7,240 MB; donors 2,937→2,337 MB). Verified `memo_code='X'` still uses an index
(Index Only Scan on `contributions_memo_code_idx`) — no seq-scan regression.
**Owner-level (still open, the durable fix):** (a) expand the disk in the Supabase dashboard — the
direct headroom fix; the daily MV refresh needs ~1.5 GB transient free space (biggest MV ~700 MB,
non-concurrent REFRESH builds a 2nd copy then swaps), and (b) attack the growth driver
`contributions` (7.2 GB, climbing) by pruning out-of-product-scope rows (hidden states / stale
cycles) or partitioning by cycle. NOTE: `REFRESH … CONCURRENTLY` is NOT a disk fix — it needs ≥ the
same disk (builds new + diffs), a UNIQUE index per MV, and can't run inside pg_cron's txn; its only
benefit is read-availability during refresh, which isn't our problem. The ~2.36 GB reclaim buys
runway but isn't permanent.
**Monitoring (added 2026-06-18):** `bun run check:disk` (`scripts/check-disk-usage.sh`) is now a
`/preflight` step — reports DB size vs ceiling each run, WARNs near the ceiling, and FAILS (AT MAX)
when free space drops below the refresh headroom. Owner watches the authoritative number in the
Supabase dashboard; keep `POLIPULSE_DISK_MAX_GB` (default 15) in sync with the real disk size.
**Tiny follow-up:** ✅ **2026-06-18** — fixed the pre-existing `fetch-committee-donors/index.ts:412`
bug (`onConflict: 'identity_hash'` → `'identity_hash,cycle'`, matching the real composite UNIQUE and
both sibling importers). Shipped in PR #451.

### 7. ☐ `public_statement` pipeline homepage-link + attribution fix
**What:** The older enrichment pipeline emits homepage-only links (142 bare-domain array entries, 2.4%)
and has at least one misattribution (Charay Smith NC cited `adamsmith.house.gov` — a different Smith).
**History:** Surfaced during the deep-link fix work.
**State:** Deferred. Worth a similar pass if that pipeline is revived.

---

## 🟡 Cleanup (low-risk)

### 8. ☐ Delete inert `enrich-batch-experiment` edge function
**What/State:** Dead experiment fn in the Supabase dashboard. Owner action (dashboard delete).

### 9. ☐ Remove 1,129 orphaned `candidate_answers` rows
**What/State:** Rows whose `candidate_id` isn't in `candidates`. Safe to delete. Not started.

### 10. ☐ Audit 2,146 visible-state `voting_record` rows with no URL
**What:** `isTrustedForScoring` trusts `voting_record` regardless of URL, so these score — but a real
voting record should have a congress.gov / state-legislature link.
**State:** Not investigated.

---

## ⚪ Code health (deliberate, when bandwidth allows)

### 11. ☐ Add minimal test harness + CI — closes the "no automated tests" blocker (Phase H).
### 12. ☐ Break down oversized files — `AnswerCoveragePanel.tsx` (~3.3k), `CandidateProfile.tsx` (~1.5k),
and the large/fragile edge fns `fetch-fec-donors`, `get-candidate-answers`.
### 13. ☐ Consolidate data access to "one front door" — route new Supabase access through a single layer.

---

## ✅ Recently done (prune after ~2 weeks)
- ✅ **2026-06-18** PR #451 **merged**; `deploy-edge-functions.yml` auto-deployed all edge fns to
  prod (run succeeded) — closes the "needs edge-fn deploy" tail on **#4** (FEC completeness metric)
  and **#5** (donor backfill scope-first fix). Both now fully live, not just merged.
- ✅ **2026-06-18** UI polish — FEC honorific stripping (`formatCandidateName`), "Back to Candidates"
  link fix, hidden-state tab count filtering, state coverage callout on signup + candidates page.
  Shipped in PRs #453/#456/#457 (all merged).
- ✅ **2026-06-18** Fixed `fetch-committee-donors:412` upsert `onConflict` → `'identity_hash,cycle'`
  (was silently erroring on a non-existent single-col UNIQUE). Shipped in PR #451 (CI green).
- ✅ **2026-06-18** Disk: dropped orphaned `_enrich_*` staging (~506 MB) + 9 unused indexes
  (~1.86 GB). **DB 15 → 13 GB.** Owner-level storage/matview fix still open (#6).
- ✅ **2026-06-17** Congress donor backfill: diagnosed (94% by-design hidden-state exclusion) + fixed
  the scope-after-limit bug in schedule-congress-donor-sync (#5 — needs edge-fn deploy).
- ✅ **2026-06-17** FEC Finding A: added `total_receipts_status` completeness metric (separate from
  itemized `status`); computed at 3 write sites, backfilled, surfaced on the card. (#4 — needs edge-fn deploy.)
- ✅ **2026-06-17** FEC Finding B applied: `other_total` = Line 14+15; 800 recon rows recomputed,
  double-count 138→0 rows. Unblocked Finding A (#4).
- ✅ **2026-06-17** Relabeled 3,615 PS "insufficient" rows → `inferred` (no verifiable source found).
- ✅ **2026-06-17** Corroborated 4,638 high-signal PS rows; applied 535 sourced (`rollout-ps-2026-06-17`).
- ✅ **2026-06-17** 31 marquee contradict corrections hand-applied; bulk-flip ruled unsafe (~50% noise).
- ✅ **2026-06-17** Relabeled 8,140 mislabeled `public_statement` (admitted-inference) → `inferred`.
- ✅ **2026-06-17** Deep-link fix: `corroborate-answers` rejects homepage-only citations (`hasDeepPath`).
