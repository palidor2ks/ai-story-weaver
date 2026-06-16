# Competitive Landscape — PoliPulse

> Verified deep-research assessment (research date **2026-06-16**). Companion to
> [`strategy-nc-beachhead.md`](./strategy-nc-beachhead.md), which turns this into a plan.
>
> **Method:** 5 parallel research agents, primary-source citations, per-claim confidence.
> **Caveat carried throughout:** `WebFetch` was 403-blocked across many primary domains (SEC,
> NCSL, Justia, vendor sites), so several confirmations rest on search-engine snippets that quote
> primary text. High-confidence claims are cross-corroborated; treat exact figures/dates marked
> *(verify)* as needing a direct re-read before they are cited externally.

## Product model under assessment

A two-sided **verified-constituent network**:

1. **Voters** join free, are identity-verified (KYC + voter-file match), mapped to their district.
2. **Candidates/officeholders pay** (candidate-side SaaS): constituent-sentiment "pulse," verified
   reach, profile management.
3. **PoliScore** — a public accountability rating computed **only** from objective public record
   (roll-call votes, official positions, public statements). The scored party **cannot pay to
   change it**.
4. **Cold-start is "PoliScore-first"**: pre-compute every incumbent's score from public data to
   seed the supply side before voters arrive.

## Confirmed vs. contradicted — prior assumptions

| Prior assumption | Verdict | Why |
|---|---|---|
| FiscalNote/Quorum is the biggest threat | ⚠️ **Contradicted / revised** | FiscalNote is in visible distress; Quorum is healthy but sells to the *advocacy* side, not the officeholder budget line. The real buyer-overlap threat is now **Granicus** (acquired Indigov Oct 2025). |
| "Verified opt-in constituent panel" is white space | ✅ **Confirmed** (Med-High) | No incumbent — engagement *or* voter-file — sells an identity-verified, consented, re-contactable district panel. (A "not-found," not a proven-absent.) |
| Verified-voter networks died on cold-start / who-pays / seasonality | ✅ **Confirmed, sharpened** | Dominant killer is **two-sided cold-start — the *supply* side never shows.** Neutrality is the sharpest single example (Crowdpac), not the most frequent cause. |
| Pay-to-play is the defining risk; wall off the score | ✅ **Confirmed, strengthened** | Credit-rating agencies are the smoking gun: issuer-pays caused *admitted* score distortion + $2.4B settlements. Walls help but don't fully neutralize perception. |
| PoliScore occupies unclaimed "FICO for politicians" space | ⚠️ **Partly contradicted** | The *concept* is taken — **OppScore** (ideological) and **Your Rep's Record** (genuine, low-reach) exist. Open space is *neutral, sourced, at-scale*, not the idea itself. |
| A sourced record-based score is legally defensible | ✅ **Confirmed** | Protected opinion via **Milkovich** + **Sullivan** actual-malice — *if* facts are true, shown, methodology disclosed, published publicly. |

## 1. Biggest threat (revised)

- **FiscalNote is the cautionary tale, not the threat.** Suspended from NYSE **2026-03-25 → OTC**
  for sub-$1 price; **ARR ~$84.1M, −21% YoY**; **~25% layoffs**; serially divesting (Oxford
  Analytica → Dow Jones $40M; TimeBase → Thomson Reuters $6.5M). Owns the nearest assets (CQ +
  VoterVoice + Apr-2026 "district matching") but is retrenching to advocacy buyers. *(verify exact
  figures.)*
- **Quorum** is the strongest incumbent on capability/capital — Serent-backed, dominates public
  affairs, owns the grassroots stack (Capitol Canary/Phone2Action), ships "pulse" surveys +
  "human-verified" data. **But "verified" = official contact data, and its buyer is the org
  *lobbying* government, not the candidate/officeholder.** An analog/feeder, not a head-on rival.
- **The actual biggest threat by buyer-overlap: Granicus**, which **acquired Indigov (Oct 2025)**,
  folding officeholder casework + constituent CRM into its Government Experience Cloud. Does
  **inbound** sentiment (message volume), not **verified outbound** pulse — one product extension
  away from the lane.

**Net:** capability threat = **Quorum**; buyer-overlap threat = **Granicus-Indigov**.

## 2. Whitespace — the verified panel (confirmed)

Neither incumbent class sells a verified, consented, re-contactable, district-mapped panel:

- **Engagement incumbents** offer inbound-message sentiment (Indigov), an org's *own*-stakeholder
  surveys (Quorum), or advocacy message-counts mapped to districts (VoterVoice).
- **Voter-file vendors** (L2, TargetSmart, Catalist, i360, NGP VAN/Bonterra, Aristotle) sell
  **registration-sourced + scraped + modeled** data and *predicted* issue scores to campaigns.
  Issue positions are **predictions explicitly labeled "modeled,"** not self-reported, verified.

Confidence **Med-High** (a not-found negative, not an exhaustive product audit).

## 3. The verification moat — real cost, navigable

Matching users to the voter file to verify them collides with **commercial-use prohibitions in
roughly half the states** (CA Elec. Code §2157.2; AZ requires a non-commercial-use statement; many
states treat nonprofits as "commercial" absent an election purpose). It is a **50-state compliance
burden, not a flat ban.** Pragmatic path: **license matching through an existing vendor**
(L2/Aristotle/TargetSmart) that already holds per-state permitted-use rights. This is both a cost
center and the reason the moat is hard to copy. *(Exact state counts = Med confidence; NCSL/EAC
tables were fetch-blocked.)*

## 4. The graveyard — sharpened lesson

Votizen, Brigade (~$40–50M, deleted "billions of rows"), Crowdpac, Causes/Countable, iCitizen,
Ruck.us, Americans Elect (~$35M, no nominee).

- **Universal killer = two-sided cold-start, usually the *supply* side failing to show.** iCitizen's
  officials wouldn't engage; Americans Elect couldn't attract serious candidates *or* hit minimal
  click thresholds. **This is the strongest endorsement of PoliScore-first** — pre-computing scores
  manufactures the supply side without it volunteering.
- **Who-pays unsolved** (ads/donations/polling are thin, commoditized).
- **Seasonality** (off-cycle collapse) recurs (Brigade, Americans Elect).
- **Neutrality** is the sharpest *single* tale — Crowdpac suspended all GOP accounts in 2018, died
  citing revenue in 2019 — but the most vivid, not the most frequent, cause.

## 5. PoliScore — concept taken, neutral-at-scale open; legally defensible

- **Not virgin territory:** **OppScore** brands itself *"a FICO score for politicians"* (−5→+5) but
  launched at TPUSA America Fest (neutrality contestable); **Your Rep's Record** computes a real
  cross-issue **letter grade** (reach/funding unverified — *worth a deeper dive*). **ProPublica's
  Represent / Congress API is discontinued (~2024)** — a vacated position.
- **Open lane = neutral + provenance-backed + at scale.** Differentiate on trust + receipts, not
  novelty.
- **Record-only design vindicated by Vote Smart:** candidate-supplied questionnaire response
  collapsed **~72% (1996) → ~26% (2018)** — politician-supplied data doesn't scale; record-based
  does.
- **Legal:** defensible as protected opinion via **Milkovich** ("no provably false factual
  connotation") + **Sullivan** actual-malice, and **Aviation Charter v. ARG/US (8th Cir. 2005)**
  (methodology-based comparative rating held non-actionable). Conditions: every input **true and
  shown**, methodology **disclosed**, **published broadly** (credit-rating cases *lost* protection
  when ratings went to a private few), no score-adjacent prose asserting unproven specific facts.
  **This makes the data-accuracy roadmap legal insurance, not just hygiene.**

## 6. Pay-to-play — the defining risk

- **Decisive variable: who can pay to move the score.** Issuer-pays credit agencies are the proof of
  catastrophe — S&P **admitted overruling its analysts** to keep clients → **$1.5B** settlement
  (2015); Moody's **$864M** (2017). The dark mirror of "candidate pays + candidate is scored."
- **FICO is the model** precisely because the scored party *structurally cannot* buy points.
- **Walls help but don't fully immunize:** Glassdoor (WSJ: 400+ firms with orchestrated 5-star
  spikes) and Healthgrades both have formal "can't pay to change your rating" policies and still
  carry pay-to-play perception. For a neutrality product, **perception is the whole ballgame** — the
  wall must be **visible, auditable, structural**, not a stated policy.

## Strategic implications

1. **Watch Granicus-Indigov (buyer overlap) and Quorum (capability), not FiscalNote.**
2. **PoliScore-first is the right cold-start** — it manufactures the supply side that killed the
   category. But it is a *discovery/PR* engine, not a revenue engine; revenue still needs voter
   density.
3. **Make the score un-buyable and prove it like FICO, not assert it like Glassdoor.** Candidate
   dollars buy *tools*, never score movement or placement.
4. **Treat data accuracy as legal insurance** — don't ship PoliScore before the accuracy scoreboard
   is green.
5. **De-risk verification by licensing voter-file matching through a per-state-compliant vendor**,
   and **beachhead clean-rules states** rather than acquiring raw files into a 50-state thicket.

**Two competitors worth a dedicated follow-up dive:** **Your Rep's Record** (closest PoliScore
analog — traction?) and **Granicus** (is verified constituent sentiment on its roadmap?).

## Sources & confidence

Claims above are drawn from agent research with per-claim confidence (High / Med / Low). The
recurring limitation this session was a **site-wide `WebFetch` 403 block** on SEC, NCSL, EAC,
Justia, Cornell, FindLaw, TechCrunch and several vendor domains; high-confidence claims were
cross-corroborated through secondary outlets, but exact figures and dates marked *(verify)* should
be confirmed against the primary source before external publication. Company-level facts about
private firms (Quorum/Granicus revenue, customer counts) were not disclosed in accessible sources.
