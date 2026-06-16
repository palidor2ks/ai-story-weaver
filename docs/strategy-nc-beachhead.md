# Strategy — North Carolina Beachhead

> The plan that turns [`competitive-landscape.md`](./competitive-landscape.md) into action.
> Decided **2026-06-16**. Owner: `palidor2ks`.
>
> **One-line thesis:** Ship a sourced, un-buyable **PoliScore** for one state — **North
> Carolina** — ride the **2026 election wave** to build matched-voter density, and **defer the
> entire moat** (KYC, voter-file matching, candidate SaaS). The verified-panel castle is act two,
> funded by the density chart we produce in 90 days.

## Why North Carolina

Chosen against four criteria; NC wins on all, including the one most analyses skip — *can we get
clean roll-call votes*.

| Criterion | North Carolina |
|---|---|
| **2026 election wave** | Tillis **US Senate** race (marquee) + **all 170 state legislative seats up**. Every legislator we score is on the ballot. |
| **Voter-data legality** | Among the most open states; full statewide voter file *with* history is public. **Not** on the commercial-use-prohibition list *(verify against NCSL/EAC — see competitive-landscape §3)*. |
| **Score that means something** | Knife's-edge legislature + veto-override supermajority fights → individual votes are consequential and newsworthy. |
| **Manageable universe** | ~186 people: 2 US Senate + 14 US House + 120 NC House + 50 NC Senate. Bounded and computable. |

Alternates if NC fails the Task-2 data spike: **Wisconsin**, then **Michigan**.
**Rejected: New Jersey** — state offices run on odd years (next NC-equivalent cycle Nov **2027**),
so 2026 is an off-cycle trough — the exact seasonality trap from the graveyard.

## Data assessment (live DB counts, 2026-06-16)

Project `Pulse Dev` (`ornnzinjrcyigazecctf`).

**Already have (reusable as-is):**

- **Scoring/matching engine is done and candidate-agnostic** (`src/lib/scoring.ts`, −10→+10,
  topic-weighted, `calculateMatchPercentage`). No code changes to point it at NC.
- **75 NC candidates seeded — all federal** (US Senate + all 14 US House districts).
- **16 of them have voting records — 39,268 roll-call vote rows** (sitting/recent members of
  Congress).
- **All 75 have quiz answers** — the quiz can match voters against them today.
- **179 statements with source URLs** across those 16 — provenance exists where the record exists.
- **Proven state-data ETL pattern** (NJ/FL/NY isolated schemas: discover → drain → cron).

**Missing (the gaps that matter):**

1. **NC state legislature = 0 rows.** Need ~**170** (120 House + 50 Senate). Both the biggest gap
   *and* the entire differentiation — nobody else scores these people.
2. **No NC General Assembly bills/votes corpus.** Load-bearing for a credible state score; fillable
   via **OpenStates/LegiScan** in ~2–3 edge functions on the existing pattern.
3. **Inconsistent federal office labels** (`Representative` vs `U.S. House NC-11` vs `Senator` vs
   `U.S. Senate (NC)`). Cosmetic but blocks a clean public score.
4. **NC campaign finance (`nc_*`)** — **deferred**; votes + positions + statements carry v0.

**Strategic read:** prove the *entire machine* (pipeline → score → trust/legal posture → quiz loop)
on the **16 NC members of Congress we already have data for**, then pour in the 170 state
legislators that make us unique. *Validate on what we have; differentiate with what we build.*

## The 5 major tasks, in order

### 1. Lock the PoliScore methodology + validate on existing federal NC data
Write the disclosed rubric (which votes/positions/statements, weighting), compute PoliScore v0 for
the ~16 NC members of Congress who have records — **every input source-linked**. Normalize the
office-label inconsistency as part of "clean inputs." Gate the result through the
`data-accuracy-verifier` agent against authoritative sources.
**Deliverable:** methodology doc + working scores for real people + go/no-go.
**Why first:** de-risks the whole bet (legal posture, trust wall, pipeline) on data we already own,
before spending on ingestion. *(Rubric skeleton below.)*

### 2. Ingest the NC General Assembly — roster, bills, roll-call votes
Reuse the NJ/FL/NY isolated-state-schema + discover/drain/cron pattern; source from **OpenStates or
LegiScan**. Seed all ~170 state legislators into `candidates` (the `state`/`district` columns
already exist), with vote-to-member linkage.
**Deliverable:** NC state votes synced + legislators present.
**Why second:** biggest gap and the actual moat — the niche no competitor occupies.
**Spike gate:** if clean machine-readable NC roll-calls are *not* obtainable, fall back to WI.

### 3. Compute PoliScore across the full ~186-person NC universe + ship public score pages + trust wall
Apply the validated rubric to federal + state; build read-only public PoliScore pages with every
input linking to its source, the methodology page, and the visible **"the score is free and can
never be bought"** wall (the FICO posture).
**Gate:** does not ship until `data-accuracy-verifier` passes — a wrong score on a named official is
a neutrality *and* legal event.
**Deliverable:** public NC PoliScore.

### 4. Wire the voter loop: quiz → match-to-scored-NC-candidates → shareable card → email capture
The engine is ready; extend `candidate_answers` to state legislators (derive from record/statements),
then ship the funnel. **No KYC.**
**Deliverable:** working voter-acquisition loop + north-star metric instrumented
(*engaged matched voters per district*).

### 5. Distribution for the 2026 window: SEO/GEO + earned media
Make every score and result card a shareable, **schema.org-structured, AI-citable** unit; seed local
NC press; give every candidate a "see your scorecard" link.
**Deliverable:** launch into the election wave + first density numbers — the chart that funds act two.

## Do NOT build yet (protect runway)

Explicitly excluded from the critical path to a launched, differentiated NC PoliScore:

- **KYC / identity verification** — a per-user cost on the free side; not needed pre-density.
- **Voter-file matching** — 50-state legal project; license through a vendor later, in act two.
- **Candidate-side SaaS / billing** — no audience yet means no willingness to pay.
- **NC campaign-finance ingestion (`nc_*`)** — enrichment, not load-bearing for v0.
- **National rollout, video cards, anything touching the over-scored 535 beyond NC.**

## North-star metric

**Engaged matched voters per NC district.** Density is what killed the graveyard; measure it from
day one. Everything above is in service of moving this one number before November 2026.

---

## Appendix — Task 1 PoliScore rubric skeleton (draft)

> A starting point to make Monday's work unambiguous. Fill in, then review with
> `alignment-quiz-reviewer` (scoring logic) + `data-accuracy-verifier` (inputs) before it is real.

**Design principles**

- **Record-only inputs.** Roll-call votes, official positions, public statements — each with a
  source URL. No modeled/inferred data in the score.
- **Disclosed methodology.** The published page shows the formula and every input, so the score
  reads as *opinion based on disclosed facts* (Milkovich protection).
- **Un-buyable.** Score inputs and weights are never affected by any payment. Stated on the page.
- **Missing-data honesty.** A thin record yields *"insufficient record to score,"* never a
  fabricated or default score (mirrors GovTrack suppressing members with <10 bills).

**Proposed components (weights are placeholders — to be set in Task 1)**

| Component | Source (existing table) | What it measures | Draft weight |
|---|---|---|---|
| Voting record | `candidate_votes` | How the member actually voted on scored bills, bucketed by topic | TBD |
| Official positions | `candidate_answers` | Stated positions on the same topic axes as the quiz | TBD |
| Public statements | `member_statements` (FTS + `match-answer-citations`) | Sourced evidence corroborating or contradicting positions ("say vs. do") | TBD |

**Per-topic, then overall**

- Score each topic bucket (economy, healthcare, education, …) on the existing −10→+10 axis from the
  record, **only where there is sufficient data**.
- Overall = transparent aggregate of populated topic scores (document the aggregation; suppress
  topics below a data threshold rather than guessing).

**Output contract (per scored official)**

- A score + a per-topic breakdown.
- **Every contributing input rendered with its source link** (vote, position, statement URL).
- An explicit *"what we could not score and why"* section.

**Validation gate (must pass before Task 3 ships)**

1. Compute for the ~16 NC members of Congress with records.
2. `data-accuracy-verifier`: spot-check inputs against the authoritative source (Congress.gov roll
   calls).
3. `alignment-quiz-reviewer`: sanity-check scoring/aggregation + missing-data behavior.
4. Manual eyeball of 3–5 well-known members for face validity.
