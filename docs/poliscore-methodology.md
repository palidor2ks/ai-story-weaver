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

## Verified data foundation (2026-06-16, project `ornnzinjrcyigazecctf`)

For the 16 NC members of Congress (Tillis, Budd + 14 House incumbents):

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

## Validation gates (must pass before any public surface — v0.0 or v0.1)

1. Compute for the 16 NC members with records.
2. `data-accuracy-verifier`: spot-check a sample of inputs against Congress.gov roll calls.
3. `alignment-quiz-reviewer`: scoring/aggregation + missing-data behavior.
4. `brand-voice-reviewer`: neutrality of key-vote descriptions and direction labels.
5. Manual face-validity eyeball of 3–5 well-known members.

## Open decisions for review

- **Key-vote selection + directions** — drafted in `poliscore-key-votes-draft.md`; needs your eyes.
- **Does v0.0 ship before v0.1 is ready,** or do we hold for the directional score? (Recommend: ship
  v0.0 participation + reviewed-record once gates 1–3 pass; layer v0.1 after neutrality review.)
- **Should `Not Voting` feed a small participation penalty in the overall,** or stay a separate
  displayed metric? (Recommend: separate metric, not blended — keeps the alignment score clean.)
