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

### 4. ☐ FEC recon — `status` doesn't gate on total receipts (Finding A) — UNBLOCKED
**What:** `ok` status only checks comparable-itemized `delta_pct`; ~363 `ok` rows are >10% off on
total receipts (some are real under-counts the Finding-B double-count was masking, now surfaced).
**History:** Found 2026-06-15; was blocked on #3.
**State:** **Now actionable** — #3 fixed, so `total_receipts_delta` is trustworthy. Decide: add a
secondary total-receipts gate to `status`, or rename/scope the metric. Run a full nightly drain
(fresh FEC fetch) first to reconfirm the recomputed deltas.

### 5. ☐ Congress donor backfill stall
**What:** 159 `candidate_committees` rows with `has_more=true` not progressing (3/day actual vs 144/day
theoretical). Likely filtered by the `congress_visible` scope in `schedule-congress-donor-sync`.
**History:** Found 2026-06-15; the missing sync edge fn was added in PR #409 — re-check whether backfill
now progresses, then widen scope or trigger a manual pass.
**State:** Needs investigation.

---

## 🟠 Infrastructure / DB

### 6. ☐ Supabase disk pressure
**What:** DB at 15 GB; `contributions` alone is 8.4 GB and growing. `refresh-donor-consolidated-daily`
already hit "No space left on device" (materialized-view refresh needs 2× temp space).
**History:** Found 2026-06-13 OOM. Will recur.
**State:** Needs a dashboard quota check → expand storage add-on or archive/expire old contribution records.

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
- ✅ **2026-06-17** FEC Finding B applied: `other_total` = Line 14+15; 800 recon rows recomputed,
  double-count 138→0 rows. Unblocked Finding A (#4).
- ✅ **2026-06-17** Relabeled 3,615 PS "insufficient" rows → `inferred` (no verifiable source found).
- ✅ **2026-06-17** Corroborated 4,638 high-signal PS rows; applied 535 sourced (`rollout-ps-2026-06-17`).
- ✅ **2026-06-17** 31 marquee contradict corrections hand-applied; bulk-flip ruled unsafe (~50% noise).
- ✅ **2026-06-17** Relabeled 8,140 mislabeled `public_statement` (admitted-inference) → `inferred`.
- ✅ **2026-06-17** Deep-link fix: `corroborate-answers` rejects homepage-only citations (`hasDeepPath`).
