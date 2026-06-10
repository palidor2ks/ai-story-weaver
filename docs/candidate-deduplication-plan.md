# Candidate de-duplication plan

> Status: **proposal / not yet executed.** Data-accuracy work (Roadmap #1) + a data migration,
> so it goes through `data-accuracy-verifier` and `migration-safety-reviewer` before anything
> is applied. No migration is auto-applied (Guardrail #1). All findings below are from the
> **Pulse Dev** project (`ornnzinjrcyigazecctf`), where the `candidates` table lives.

## 1. The problem, in one sentence

The same real person can exist as **two+ `candidates` rows** — most visibly **Seth Moulton**, who
shows up as both a U.S. House incumbent (`M001196`) and a U.S. Senate candidate (`S6MA00296`).

## 2. Root cause (verified)

`_shared/onboard-candidate.ts` already has a 4-step dedup funnel:

1. collapse by `candidates.fec_candidate_id`,
2. then by `candidate_fec_ids` alias,
3. then by `resolve_person` / `person_id`,
4. then by normalized `(nameKey, state, officeClass, district)`, else insert.

It fails for a person **changing office** because:

- **Step 4 requires the same `officeClass`** — `house` ≠ `senate`, so a sitting Rep filing for
  Senate never matches the fallback.
- **Steps 1–2 only fire if the person's FEC ids / `person_id` are already cross-linked**, and they
  are **not**: Moulton's two rows carry **different `person_id`s**
  (`da459adb-…` vs `50ab42b2-…`). `resolve_person` minted a *new* person for the Senate candidacy.

Measured blast radius (shared **active** principal committee = same person across candidacies):

| metric | value |
|---|---|
| shared-committee clusters | **31** |
| …with the *same* `person_id` (correctly unified) | **0** |
| …with a NULL `person_id` | 0 |
| …with **different** `person_id` (the bug) | **31** |

The single strongest identity signal is being ignored: **FEC assigns one principal committee to a
person's candidacies across offices.** Every one of the 31 clusters shares a committee yet was
split into two persons.

## 3. Inventory of duplicates (~35 clusters)

Detected by two independent signals (union ≈ 35 clusters; exact list regenerated at run time by the
queries in §6):

- **Signal A — shared active principal committee → 2 candidate_ids:** 31 clusters.
- **Signal B — same normalized `name + state` across rows:** 24 clusters (overlaps A, plus a few
  with no shared committee).

Classified by root cause / required handling:

| Type | Pattern | Examples | Handling |
|---|---|---|---|
| **A. Bioguide + FEC** | sitting member (bioguide id) also has an FEC candidacy | `M001196`+`S6MA00296` (Moulton); `M000133`+`S4MA00028` (Markey); `A000370`+`H4NC12100` (Adams); `H001095`+`S6TX00511` (Hunt); `L000595`+`S6LA00664` (Letlow); `C001130`+`S6TX00552` (Crockett) | **Auto-merge.** Canonical = bioguide row (has votes/answers/photo). |
| **B. FEC + FEC, cross-office** | House FEC id + Senate FEC id, same person | `H2WY00166`+`S6WY00209` (Hageman); `H6GA14227`+`S6GA00267` (Box); `H4WV01058`+`S6WV00147` (Evans); `H8TX32098`+`S4TX00722` (Allred); `H2AK01158`+`S6AK00276` (Peltola) | **Auto-merge.** Canonical = richer/most-recent candidacy row. |
| **C. FEC + FEC, same office** | redistricting / re-run, same office | `H6UT02465`+`H6UT02473`; `H6FL12207`+`H6FL12223`; `S6ME00316`+`S6ME00324` | **Auto-merge** after confirming same person. |
| **D. AI-generated pairs** | two synthetic `ai_*` ids, same name+state (state/local) | NJ: Carmichael, Espinosa, Uhrin, Lombardi | **Merge** (canonical = more-complete row) **and fix the `discover-state-candidates` ingest** that minted both. |
| **E. Suspicious / verify first** | shared committee but **different states**, or name collision | `H6MO08217`+`H6TX32241`; `H6FL23139`+`H6GA23012` | **Do NOT auto-merge.** Could be two different people or a mis-linked committee — verify against FEC. |

## 4. The merge mechanics (why it must be one atomic migration)

`candidates.id` is referenced by **5 hard FKs** *and* **26 tables carry a `candidate_id` column**
(soft refs, no FK). A merge of `dup_id → canonical_id` must, in a single transaction:

1. **Re-point hard-FK children:** `candidate_committees`, `candidate_topic_scores`, `donors`,
   `independent_expenditures`, `representative_social_posts`.
2. **Re-point / dedupe the 26 `candidate_id` tables**, notably: `contributions`,
   `finance_reconciliation`, `committee_finance_rollups`, `candidate_votes`, `candidate_answers`,
   `candidate_overrides`, `candidate_fec_ids`, `election_candidates`, `independent_expenditures`,
   `pac_*`, `donor_*`, `user_rep_comparisons`, `profile_claims`, etc. Tables with a
   `(candidate_id, …)` unique key need **upsert-or-skip**, not blind update, to avoid conflicts.
3. **Preserve both FEC ids** on the survivor: insert the dup's FEC id(s) into `candidate_fec_ids`
   pointing at `canonical_id` (so the House *and* Senate ids resolve to one person forever).
4. **Unify `person_id`:** re-point the dup's `person_id` references and retire the duplicate person
   row (or repoint to the canonical person).
5. **Carry over the best display fields** the survivor is missing (photo, proper-case name).
6. **Delete the duplicate `candidates` row** last.

Implementation shape: a `merge_candidate(canonical_id text, dup_id text)` SQL function that does all
of the above transactionally, driven by a reviewed mapping table of `(canonical_id, dup_id, type)`.
All-or-nothing per Guardrail/rulebook #4.

### Canonical-id heuristic
`bioguide-keyed` > `FEC-keyed` > `ai_*`-keyed; tie-break by completeness (has votes / answers /
photo) then by the **active** candidacy. For Moulton the survivor is **`M001196`**.

### Display note (separate, smaller decision)
A merged profile still has one `office`. Recommended: keep the survivor's current office
(incumbency) and surface the **active race** via `election_candidates` / the active committee — i.e.
"U.S. Representative (MA-06) · candidate for U.S. Senate 2026". This is a UI follow-up, not part of
the data merge.

## 5. Prevention (stop it recurring)

1. **Add committee-based resolution to the onboarding funnel (highest leverage).** Before insert, if
   the discovered candidacy's **principal committee** already belongs to an existing
   candidate/person, collapse onto it. This one rule catches all 31 shared-committee clusters,
   *including cross-office*.
2. **Make `resolve_person` office-agnostic** for the same human: match on `(nameKey, state)` (+ FEC
   committee / FEC-id crosswalk) **without** requiring equal `officeClass`, so a House→Senate move
   reuses the existing `person_id`.
3. **Always populate `candidate_fec_ids`** for every FEC id seen for a person (House, Senate, Pres),
   so step-1/step-2 resolution works on the next ingest.
4. **Add a standing duplicate audit** — a scheduled function (sibling to
   `nightly-finance-reconciliation`) that runs the §6 queries and writes any new shared-committee /
   name+state clusters to a `candidate_duplicate_flags` review table. Catches escapes early instead
   of at user-report time.
5. **Backfill `person_id` uniqueness:** after the merge, consider a guard so two active candidate
   rows can't share a principal committee without an explicit override.

## 6. Detection queries (re-runnable)

```sql
-- Signal A: one active principal committee → multiple candidate_ids (same person)
select fec_committee_id, count(distinct candidate_id) n, array_agg(distinct candidate_id) ids
from candidate_committees where active = true
group by fec_committee_id having count(distinct candidate_id) > 1
order by n desc;

-- Signal B: same normalized name + state across rows
-- (token-sorted, comma-insensitive name key; see query used in investigation)
```

## 7. Proposed execution order

1. Land §5.1–5.3 prevention in `onboard-candidate.ts` + `resolve_person` **first** (stop the
   bleeding), with unit coverage for the House→Senate case.
2. Build `merge_candidate()` + the reviewed mapping table; dry-run report row counts to be moved.
3. Run Type A/B/C/D merges; hold Type E for manual FEC verification.
4. Add the standing duplicate-audit function (§5.4).
5. UI disambiguation of active race vs incumbency (§4 display note).

> Nothing here is applied yet. Next concrete step: review this plan, then implement §5 prevention
> behind the existing onboarding front door before any merge migration.

## Status (2026-06-10)

- §5.1 prevention **landed** (committee-based resolution in `_shared/onboard-candidate.ts` +
  unit tests; PR #342).
- §4 merge tooling **drafted, not applied**: `supabase/migrations/20260610130000_candidate_merge_function.sql`
  (+ `scripts/candidate-merge-proposals.sql`). Reviewed by migration-safety-reviewer; initial
  NO-GO findings (anti-tampering triggers breaking/half-merging, merge-map FK chains) are fixed —
  the function now disables/re-enables the tamper triggers transactionally and asserts zero
  leftover dup references before deleting the dup row. Function body validated against live Dev
  data via a session-temporary copy; Moulton dry-run: 6,357 contributions + 2,051 donors move,
  `fec_transaction_overlap = 0`.
- §5.2–5.4 (office-agnostic `resolve_person`, alias backfill, standing duplicate audit) still open.

## Status (2026-06-10, later) — applied to Dev + Moulton pilot MERGED

- Migration **applied to Pulse Dev** (deliberate, user-approved). Proposals seeded:
  **42 pairs** (28 Signal A shared-committee, 14 Signal B name+state incl. 4 `ai_pair`);
  the 2 cross-state Type E clusters (C00934869 MO/TX, C00896787 FL/GA) were NOT proposed.
- **Pilot executed:** `merge_candidate('M001196','S6MA00296', p_dry_run := false)` — verified:
  one Moulton row; both FEC ids aliased to M001196 (House/crosswalk + Senate/merge); 7,708
  cycle-2026 contributions (1,351 + 6,357) and 3,147 donors on the survivor, 0 on the dup;
  orphan person removed; map row `merged`; all 4 tamper triggers re-enabled (the function
  auto-disabled 4 — the precedent's 3-name list would have missed one);
  `get_contribution_totals('M001196','2026')` returns the same grand_total $4,542,839 — no
  double-count, no loss.
- Remaining: 41 `proposed` pairs awaiting review/approval (27 Signal A are high-confidence;
  14 Signal B need per-pair verification before approving).

## Status (2026-06-10, final) — ALL 42 MERGES EXECUTED on Dev

- **27 Signal A** batch-merged after all dry-runs showed `overlap = 0` (biggest: C001129 ← S6GA00390,
  29,999 contributions; H001095 ← S6TX00511, 7,690).
- **14 Signal B** merged after per-pair verification: every pair was an exact normalized-name +
  state + party match in the House↔Senate (or ward-label) pattern — incl. Allred TX (10,200
  contributions on the old House id), Crockett TX, Letlow LA, Hern OK, Peltola AK, and the 4 NJ
  `ai_pair` ward duplicates. No user profile claims were dropped anywhere.
- **Post-merge integrity sweep: clean.** 0 dup candidate rows, 0 orphaned
  contributions/donors/answers, 0 name+state duplicate clusters remain, all 4 tamper triggers
  re-enabled. `candidates` now has 2,386 rows.
- **Still open:** the 2 Type E cross-state clusters (C00934869 MO/TX, C00896787 FL/GA) stay
  quarantined pending manual FEC verification. Cosmetic: a few `ai_pair` survivors kept the
  generic "Ward Council Member" label while the merged dup had the more specific "Ward N" label.
- All 42 merges are audited in `candidate_merge_map` (status `merged`, full per-table reports in
  the `report` jsonb).

## Status (2026-06-10, close) — Type E resolved, ZERO duplicate clusters remain

- **Type E resolved with palidor2ks's domain knowledge (44 merges total):**
  - **Raven Harrison** — the GA-23 filing is a **clerical error** (GA has no district 23); she is
    FL. Merged H6GA23012 → H6FL23139 (350 contributions moved, GA id aliased), and the phantom
    GA-23 race membership was deleted from `election_candidates`. Profile: U.S. House FL-25.
  - **Gordon Heslop** — **legally ran in both MO and TX**; same person, two real candidacies.
    Merged H6TX32241 → H6MO08217 (canonical = MO via the committee rollup association); the TX
    candidacy is preserved as a FEC-id alias and race membership.
- Cosmetic ward labels fixed: the 4 NJ `ai_pair` survivors now show their specific
  "Ward N Council Member" office, backfilled from `election_candidates`.
- **Shared-committee duplicate clusters remaining: 0. Name+state duplicate clusters: 0.**
