# PoliScore — Methodology (v0)

> **Status:** DRAFT for review. Task 1 of the NC beachhead
> ([`strategy-nc-beachhead.md`](./strategy-nc-beachhead.md)). Validated against live data
> 2026-06-16; no public surface ships until the gates at the bottom pass.
> Companion: [`poliscore-key-votes-draft.md`](./poliscore-key-votes-draft.md) — the reviewable
> key-vote selection.

## What PoliScore is

A public, record-based accountability + alignment score for an elected official, computed **only**
from objective public record, with **every input linked to its source**. The scored official
**cannot pay to change it** (the inputs are public votes). Designed to be legally defensible as
*opinion based on disclosed facts* (Milkovich; Aviation Charter v. ARG/US) — which requires that the
underlying facts be true, shown, and the methodology disclosed.

## Design principles

1. **Record-only inputs.** Roll-call votes, official positions, public statements — each with a
   source URL. No modeled or inferred data in the score.
2. **Disclosed methodology.** The published page shows the formula and every input.
3. **Un-buyable.** Inputs and weights are never affected by any payment. Stated on the page.
4. **Missing-data honesty.** A thin record yields *"insufficient record to score,"* never a
   fabricated or default score.

## Scope

**Federal delegations of NC + NJ** (~30 members: 16 NC + 14 NJ, all with floor-vote records). The
federal key-votes rubric scores both at no extra curation. **NC** is the public/marketing beachhead
and the state-legislature build; **NJ federal** is included for home-turf dogfooding and its 2026
House races; **NJ state legislature is parked for the 2027 cycle.**

## Verified data foundation (2026-06-16, project `ornnzinjrcyigazecctf`)

For the 16 NC members of Congress (Tillis, Budd + 14 House incumbents); NJ's 14 federal members carry
an equivalent record (16,784 floor-vote rows):

- **Roll-call votes are the clean substrate.** `candidate_votes.action_type='floor_vote'` →
  **18,560 Yea/Nay** rows; **100%** join to a bill and **100%** of those bills carry a `topic`.
  `bills.topic` maps exactly to the 6 national quiz topics. Sourced from Congress.gov.
  - Vote *positions*: `Yea`, `Nay`, `Not Voting`, `Present`. `action_type` also includes
    `cosponsor` / `sponsor` (excluded from the vote score; usable later as engagement signals).
  - **Tenure differs** — five members seated Jan 2025 have only one Congress of record, so raw vote
    *counts* are not cross-comparable; the score uses **rates and curated key votes**, never counts.
- **`candidate_answers` is demoted from the score.** 4,503 answers, but only **14%** carry a source
  URL, **31%** are `evidence_type='inferred'`, **45%** are low-confidence, `has_discrepancy` is
  never populated, and ~1,500 are labeled `voting_record` with only **52** actual
  `voting_record_summary` values — i.e., provenance claimed without receipts. **Not trustworthy
  enough for a public, legally-exposed score.** It may later seed *candidate-claimed* positions for
  say-vs-do comparison, but never the score itself.
- **Auto-`topic` tags are noisy.** Contested-vote sampling found mis-tags (a Schiff censure
  resolution tagged *Environment & Energy*) and many procedural rows ("On Agreeing to the
  Amendment"). Consequence: **do not auto-bucket all 18,560 votes**; curate.

## v0.0 — Objective record scorecard (ships first)

No ideological judgment → maximally defensible. Per member:

- **Participation rate** = `Yea+Nay / (Yea+Nay+Not Voting+Present)`. Computed and verified for all 16
  (range 90.7%–99.7%; the 2026 marquee name, Tillis, is lowest at 91.9% / 188 missed).
- **Per-topic record**, built **only from reviewed key votes** (see v0.1), not raw auto-tagged
  volume — to avoid inheriting the mis-tagging.
- Rendered with the **"free & un-buyable"** wall, full methodology, and a source link on every vote.

## v0.1 — Directional alignment (the key-votes rubric)

Turns the record into a −10..+10 lean per topic, matching the quiz axis so it plugs into the
existing `src/lib/scoring.ts` matching engine (−10 left ↔ +10 right).

### Selection criteria (which votes qualify as "key votes")

A vote is eligible only if **all** hold:
- **Substantive final action** — final passage, adoption of a conference report, or a veto override.
  **Excluded:** procedural/rule votes, motions to recommit, "agreeing to the amendment," quorum.
- **Named, single-subject bill** with a human-readable title (no bare "On Agreeing to…" labels).
- **Human-reviewed topic** — the analyst confirms the bill's topic (overriding the noisy auto-tag).
- **Has a clear policy direction** on one of the 6 topic axes (see below). Pure-procedural or
  near-unanimous housekeeping votes are dropped (no signal).

Target **5–8 key votes per topic** per Congress. Fewer than a floor (e.g. <3) → topic is shown as
*"insufficient record."*

### Direction assignment (the neutrality-critical step)

- Each key vote is mapped to the **disclosed policy axis** of its topic (the same axis the quiz
  questions use), and a Yea is labeled with the pole it expresses (e.g., for *Environment & Energy*:
  "Yea = fewer emissions limits" vs "Yea = more"). The label states *what the bill does*, in neutral
  terms, with a one-line description + source — it does **not** editorialize good/bad.
- **Governance to keep it neutral:** (a) every key vote and its direction is published with rationale
  and source; (b) selection is balanced — the same substantive bar applies regardless of which party
  a Yea favors; (c) the full key-vote list is versioned in-repo and open to public challenge; (d) a
  neutrality review (`alignment-quiz-reviewer` + `brand-voice-reviewer`) gates each release.

### Score math

For member *m*, topic *t* with key votes *K*:

```
topic_score(m,t) = 10 * avg over k in K of  sign(pole_k) * vote_value(m,k)
   where vote_value = +1 if voted the pole, −1 if voted against it,
                       and Not Voting / Present are excluded from the average
overall(m) = avg of populated topic_scores   (suppress topics with < floor key votes)
```

Output per official: overall + per-topic breakdown, **every contributing vote rendered with its
Congress.gov link**, plus an explicit *"what we could not score and why."*

### Hardening locked from the scoring gate (`alignment-quiz-reviewer`)

1. **Per-member participation floor (not rubric size).** Suppress a topic to *"insufficient record"*
   unless the **member actually cast** ≥ the floor of Yea/Nay votes in it: **≥2 for a 3-vote topic,
   ≥3 for a 4–5-vote topic.** This prevents a maximally-confident ±10 from a single observation when
   a member missed most key votes. The floor constant is **3** rubric votes minimum per topic; below
   that the topic is not scored at all.
2. **`Not Voting` is excluded from the average AND surfaced per topic** as *"N of M key votes cast,"*
   not just the page-level participation rate — closes the "skip the divisive votes" gaming path.
3. **Dedicated storage — never overwrite `candidates.overall_score`.** Write to a new
   `poliscore_overall` (+ per-topic) column. The existing `useCandidateScoreMap` guard discards a
   value of `0`, which would silently drop a genuine centrist PoliScore of 0.0 and fall back to the
   low-quality `candidate_answers` score. Separate column avoids the collision.
4. **Two scores never mix.** The record-based PoliScore and the `candidate_answers` quiz-based score
   coexist only as **distinctly labeled** numbers ("record-based" vs "quiz-based"); they are never
   averaged, and the same surface never shows both unlabeled. `candidate_answers` is demoted to the
   quiz-based path only.
5. **Low-sample honesty:** a topic scored on ≤3 votes carries a "low sample" badge. Reuse
   `calculateAverageScore` from `src/lib/scoring.ts` — do not write a parallel averaging function.
6. **Label hygiene (impl):** `src/lib/scoreFormat.ts` has three conflicting label vocabularies; pick
   one for the public score and soften "Far Left/Far Right" before launch.

## Validation gates (must pass before any public surface — v0.0 or v0.1)

1. Compute for the 16 NC members with records.
2. `data-accuracy-verifier`: spot-check a sample of inputs against Congress.gov roll calls.
3. `alignment-quiz-reviewer`: scoring/aggregation + missing-data behavior.
4. `brand-voice-reviewer`: neutrality of key-vote descriptions and direction labels.
5. Manual face-validity eyeball of 3–5 well-known members.

## Decisions locked (2026-06-16)

- **Ship sequencing:** **v0.0 ships first** (objective record scorecard) once gates 1–3 pass; v0.1
  (directional) layers on after the neutrality gate.
- **`Not Voting`:** stays a **separate displayed participation metric**, not blended into the
  alignment score.
- **Appropriations / omnibus votes:** **excluded** from the directional score (ambiguous single-axis
  direction); they may still appear in the raw record.
- **Topic assignment:** the auto `bills.topic` tag is **not trusted** — topic is **hand-assigned per
  key vote** during curation (see `poliscore-key-votes-draft.md`).

## Still open (blocks v0.1 launch)

- **Left/right balance HARD GATE** — rubric is ~22:1 right-coded; need **≥2 left-coded votes per
  topic** before v0.1 scores anyone (see `poliscore-key-votes-draft.md`). *In progress.*
- **Implement the scoring hardening** above (per-member floor; `poliscore_*` storage; "N of M cast").
- **Re-run both gate reviewers** on the balanced rubric, then build v0.1.

*Done this pass:* directions verified against Congress.gov; neutrality + scoring gates run and their
fixes applied; NJ federal added to scope.
