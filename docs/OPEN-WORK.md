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

### 18. ☐ Follow-on: inline role checks for 17 remaining `authenticated_security_definer_function_executable` warnings
**What:** After PR #514, 17 admin-panel functions (Group B) still carry the Supabase advisor warning
because `authenticated` can still call them. These are correct-by-design for now (admin UI needs them),
but the durable fix is to add `IF NOT has_role('admin') THEN RAISE EXCEPTION 'admin only'; END IF;`
inside each function body, OR route those RPCs through a service_role edge function that checks the
session's role before forwarding.
**History:** PR #514 (2026-06-21) explicitly deferred this as follow-on work — the immediate risk
(anon access) is fixed; auth-access is an advisory-level warning, not a breach.
**State:** Not started. Low urgency — admin panel already requires login, so no real admin action is
possible anonymously.

### 19. ☐ Enable "Leaked password protection" in Supabase Auth dashboard
**What:** Supabase Security Advisor shows a "Leaked password protection" warning. Cannot be fixed via
SQL migration — requires toggling Authentication → Settings → Password Security in the Supabase dashboard.
**History:** Surfaced during the PR #514 security audit session (2026-06-21).
**State:** Not done. Owner action (dashboard toggle).

### 20. ☐ Rotate secrets exposed during the worker-migration debugging
**What:** Rotate the prod secrets pasted into the chat transcript while debugging the Railway worker:
the `service_role` key, `cron_secret`, the 5 `*_sync_secret`s, the DB password, and the Perplexity +
Lovable API keys. Update Railway env (and Vault) to match after rotating.
**History:** Worker go-live session 2026-06-23; user intentionally deferred until the worker was stable.
**State:** Not started — owner action. The DB password + `service_role` key are highest-value.

### 21. ☐ Railway worker — two low-priority post-go-live watch items
**What:** (a) `fetch-nj/fl/ny-finance` edge logs show 401 flapping from a **non-worker** caller (the
worker's own drains succeed) — harmless (the `x-sync-secret` gate rejects them). Likely a lingering/
duplicate Railway deployment, so first confirm only ONE worker runs; to fingerprint the caller, add a
`console.warn('unauthorized', req.headers.get('user-agent'))` on the 401 path of the 3 fns, deploy, read
logs. (b) `fec_candidate_drain` had a 16-job backlog of stale "operation timed out" jobs from redeploy
churn — should self-drain (runtime ~137s < the `*/3` interval; #542's 240s fix is live); glance to confirm.
**History:** Both uncovered while chasing the 401 in the 2026-06-23 worker session. Details in HANDOFF.
**State:** Not started — both likely self-resolving; revisit only if they persist.

### 6. ✅ Supabase disk pressure — resolved 2026-06-19
**What:** DB was ~15 GB; `refresh-donor-consolidated-daily` OOM'd 2026-06-13 (matview refresh needs ~1.5 GB transient headroom).
**Done (2026-06-18):** dropped orphaned `_enrich_*` staging (~506 MB) + 9 unused indexes (~1.86 GB). **DB 15 → 13 GB.**
**Done (2026-06-19):** owner expanded disk in Supabase dashboard **15 → 27 GB**. Dashboard now shows **14.27 GB used of 27 GB** (DB 13.1 + WAL 1 + system 0.17). Free: ~12.7 GB >> 1.5 GB headroom needed. `POLIPULSE_DISK_MAX_GB` updated to 27 in `check-disk-usage.sh` to match.
**Long-term:** `contributions` (7.2 GB, climbing) remains the growth driver — prune hidden-state / stale-cycle rows or partition by cycle before disk fills again. But the immediate OOM risk is gone.
**Tiny follow-up:** ✅ **2026-06-18** — fixed the pre-existing `fetch-committee-donors/index.ts:412` bug (`onConflict: 'identity_hash'` → `'identity_hash,cycle'`). Shipped in PR #451.

### 7. ☐ `public_statement` pipeline homepage-link + attribution fix
**What:** The older enrichment pipeline emits homepage-only links (142 bare-domain array entries, 2.4%)
and has at least one misattribution (Charay Smith NC cited `adamsmith.house.gov` — a different Smith).
**History:** Surfaced during the deep-link fix work.
**State:** Deferred. Worth a similar pass if that pipeline is revived.

---

## 🟢 State coverage (product expansion)

### 16. ✅ TX state campaign finance (Texas Ethics Commission) — done 2026-06-21
**What:** Full per-state finance pipeline for TX, the bulk-ZIP model (random-access ZIP-over-Range read
of TEC's ~1 GB `TEC_CF_CSV.zip`): schema, `fetch-tx-finance` edge fn (discover+drain), cron+secret gate,
`tx_legislator_finance` matching RPC, and `TxStateFinanceSection` UI.
**History:** PRs #516 (pipeline) + #517 (go-live: drain priority + scoreboard) merged 2026-06-21. All five
council reviewers gated; 2 real catches fixed (invisible discover failures; maxShards OOM).
**State:** Live on prod. `contribs_*` backfill still draining (~1-2 days to broad coverage). TX candidates
already public (never hidden). **Owed:** spot-check `total_raised` vs the TEC site before trusting numbers.

### 17. ☐ NC state campaign finance (NCSBE) — recon done, build pending
**What:** Next state after TX. NC is an app-scrape of `cf.ncsbe.gov` (no bulk file). Recon (2026-06-21)
confirmed a clean per-report receipts CSV (`CFOrgLkup/ExportDetailResults/?ReportID=X&Type=REC`) and an
HTML transaction search (`CFTxnLkup/TxnSearchResults/`, POST, filter by `SelectedOffice`).
**History:** Recon spike only; details + the two architecture paths in `docs/HANDOFF.md` (2026-06-21) and
`docs/state-campaign-finance.md`. 244 NC legislators already in `candidates`.
**State:** Not built. Open: crack the committee→ReportID enumeration (Path B, clean CSV) or fall back to
Path A (HTML scrape by office), then build the 5-piece pipeline.

### 14. ☐ Expand state-legislator ingestion beyond NJ + NC
**What:** `discover-state-legislators` (OpenStates → `candidates`) currently sweeps only NJ + NC.
Add more visible states (NY, PA, …) by extending the `STATES` array once NJ+NC looks right in the UI.
**History:** Shipped 2026-06-18 (PR #455) directory-first; 293 NJ+NC legislators ingested + verified.
**State:** Not started. Each new state is just an array entry; the cron + dedup funnel already handle it.

### 15. ☐ Phase-2 AI scoring for state legislators
**What:** The 293 ingested legislators are `tier_3` / `pending_research` (browseable, unscored). Enroll
them in the research/scoring queue so they get alignment scores like federal candidates.
**History:** Deliberately deferred at ingestion (directory-first decision, PR #455) to avoid burning
AI quota on the whole body before the directory entries were validated.
**State:** Not started. Enroll via the existing research-queue drainer when coverage warrants.

---

## 🟡 Cleanup (low-risk)

### 8. ☐ Delete inert `enrich-batch-experiment` edge function
**What/State:** Dead experiment fn in the Supabase dashboard. Owner action (dashboard delete).

### 8b. ☐ Delete neutered recon probes `tx-cf-probe` + `nc-cf-probe`
**What/State:** Throwaway recon edge fns (now 410 no-ops) from the TX/NC finance work. Owner action
(dashboard delete — MCP has no delete tool).

### 9. ☐ Remove 1,129 orphaned `candidate_answers` rows
**What/State:** Rows whose `candidate_id` isn't in `candidates`. Safe to delete. Not started.

### 10. ☐ Audit 2,146 visible-state `voting_record` rows with no URL
**What:** `isTrustedForScoring` trusts `voting_record` regardless of URL, so these score — but a real
voting record should have a congress.gov / state-legislature link.
**State:** Not investigated.

### 17. ☐ Close stale name-formatting PR #327 (do NOT merge)
**What:** Codex PR "Normalize and format person display names" adds a *competing* formatter
(`src/lib/nameFormat.ts` / `formatPersonName`), rewires the same components, AND ships a DB backfill
migration that rewrites `candidates.name` / `static_officials.name` / `candidate_overrides.name` /
`persons.display_name`.
**Why close:** Superseded by the consolidated `src/lib/candidateName.ts` (#16); the migration
denormalizes the FEC-canonical names we intentionally keep for ETL matching. From 2026-06-08, so it
would also conflict heavily.
**State:** Open. Recommend closing with a note pointing to `candidateName.ts`. (Drafts #494/#302 and
stale Codex SEO PR #300 also linger — owner's call.)

---

## 🔵 Frontend (Design B rollback follow-ups)

### 17. ✅ Re-apply bug/data fixes dropped by the Design B rollback — done 2026-06-26 (rollback reversed)
**What:** The June-26 rollback (#600) reverted the frontend to the pre-Design-B June-24 baseline,
dropping real fixes entangled in the redesigned files. **Resolved:** the user decided they wanted
Design B back after all (with the chip-tabs, bottom nav, and new pages), so we **restored the whole
frontend to the pre-rollback tip `3324ecec`** — which brings those fixes back wholesale (vote-analysis
cosponsorship, share-card "no fake scores", IE data hardening, excluded-IE-committee filter, cached AI
analysis, Challenger status). Branch `claude/reapply-design-b-keep-ie`. No cherry-pick needed.
**Note:** The Nolan Chart / Political Compass and the state-coverage callout stay **dropped** (user's
choice). The outside-money (IE) line — which Design B had silently stopped rendering — was **re-added**
and restyled to the poli-* palette.

## ⚪ Code health (deliberate, when bandwidth allows)

### 11. ☐ Add minimal test harness + CI — closes the "no automated tests" blocker (Phase H).
### 12. ☐ Break down oversized files — `AnswerCoveragePanel.tsx` (~3.3k), `CandidateProfile.tsx` (~1.5k),
and the large/fragile edge fns `fetch-fec-donors`, `get-candidate-answers`.
### 13. ☐ Consolidate data access to "one front door" — route new Supabase access through a single layer.
### 16. ✅ Consolidate the candidate-name formatters into ONE shared module — done 2026-06-20
**What:** Candidate names were being formatted by **five** divergent implementations —
`formatCandidateName` (`src/lib/utils.ts`), `toDisplayName` (`src/lib/officeLabel.ts`), `formatName`
in `scripts/generate-candidates-json.ts`, the CDN-path map in `useCandidates`, and an inlined copy in
the `refresh-candidates-cache` edge function. Divergence caused the same display bug to recur 5×.
**History:** 2026-06-20 saga (PRs #495/#497/#498/#499/#500). Each fix only patched one formatter.
**Done:** Canonical formatter now lives in `src/lib/candidateName.ts` (pure, no deps); `utils.ts` and
`officeLabel.ts` (`toDisplayName`) re-export it; the script + `useCandidates` import it. The Deno edge
runtime can't import frontend files, so it has a byte-identical copy at
`supabase/functions/_shared/candidateName.ts`, and `src/lib/candidateName.test.ts` runs **both** through
one fixture table (drift guard — CI fails if they diverge). Superset adds Roman-numeral (II/III/IV) and
Mac casing that the old `formatCandidateName` lacked.
**Note:** `tidyName` in `_shared/finance-caption.ts` is a deliberately separate **org-aware** formatter
(uppercases PAC/LLC acronyms, skips org reorders) for finance captions — not folded in.

---

## ✅ Recently done (prune after ~2 weeks)
- ✅ **2026-06-23** Railway graphile-worker migration **fully live + cleaned up**. Four stacked
  failures fixed (PRs #538/#542 + Railway config): `.ts` task loading (graphile-worker's default
  `fileExtensions` excludes `.ts`), DB connection (transaction pooler `:6543` → session pooler `:5432`
  + alphanumeric password to dodge the `ECIRCUITBREAKER` URL-parse trap), edge-fn auth (send
  `x-cron-secret` from `CRON_SECRET` — the service-role bearer no longer matches under the new API-key
  system), and `fec_candidate_drain` 120→240s timeout. Then #545 (`fetch-tx-finance` `verify_jwt=false`)
  and retired the 15 Railway-replaced pg_cron jobs (reconciled into `public.claude_migration_log`). All
  16 worker tasks run green. Follow-ups parked as #20/#21. Full story in HANDOFF 2026-06-23 entries.
- ✅ **2026-06-18** State-legislator ingestion (PR #455): `discover-state-legislators` edge fn +
  weekly cron + State/Local tab wiring; 293 NJ+NC legislators ingested & verified live (correct
  parties, chamber totals match reality). Directory-first, unscored — see #14/#15 for follow-ups.
- ✅ **2026-06-18** Directory perf (PR #460 + #461): pushed the visible-states filter server-side —
  candidate fetch 2,685→476 rows (`.not state in hidden`), and topic scores 15,201→1,416 via a new
  `get_visible_candidate_topic_scores()` SECURITY DEFINER RPC. Reviewer GO; advisors clean.
- ✅ **2026-06-18** `proxy-image` allowlist widened (PR #460) for state-legislator photo hosts
  (ncleg.gov = 135 NC members, nj.gov, S3/GCS, Wix, Squarespace) — fixes the `host not allowed` 400s.
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
