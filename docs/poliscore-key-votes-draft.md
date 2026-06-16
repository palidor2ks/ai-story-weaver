# PoliScore Key Votes — DRAFT v2 for review

> **The neutrality-critical artifact.** Selects which roll-call votes define each topic's directional
> score and which way each leans. Per [`poliscore-methodology.md`](./poliscore-methodology.md), every
> entry ships with source + rationale and is open to challenge. **Nothing here scores a real person
> until** each direction is verified against the Congress.gov summary and the neutrality gate passes.
> Built from NC-delegation contested votes (Yea/Nay split), sampled 2026-06-16.

## Decisions locked (from review)

- Ship **v0.0 first**; `Not Voting` is a **separate** metric; **appropriations/omnibus excluded**.
- **v1 dispositions:** keep **HR4758, HR30 (→ Nat. Security), HR28, HR6359**; cut **HR2670, HR4016,
  HR6945, HR1329, HRES863**; deeper pull for **Government & Democracy**.

## Two findings that shape curation

1. **`bills.summary` is empty in the DB** for the entire candidate pool → official summaries must be
   pulled from Congress.gov to finalize neutral direction labels. Directions below are drafted from
   bill **titles** and marked `[verify]`.
2. **`bills.topic` is unreliable** → topic is **hand-assigned** here. (The auto "Government &
   Democracy" bucket returned a maternal-health act, "Born-Alive Abortion Survivors," a
   Strategic-Petroleum-Reserve/China bill, and "On Motion to Adjourn.")

## Curated v2 shortlist (by reviewed topic)

Lean maps to the quiz axis (**− left ↔ + right**). All directions `[verify against Congress.gov]`.
Target ≥3 (ideally 5) clean votes per topic.

### Environment & Energy — well covered
| Bill (Cong) | Yea expresses (draft, neutral) | Lean |
|---|---|---|
| HR4758 Homeowner Energy Freedom Act (119) | Limit federal energy-efficiency mandates on home appliances | + `[v]` |
| HR1366 Mining Regulatory Clarity Act (119) | Ease federal permitting for mining on public land | + `[v]` |
| HR4468 Choice in Automobile Retail Sales Act (118) | Block the EPA tailpipe rule that accelerates EV adoption | + `[v]` |
| HR1346 Nationwide Consumer and Fuel Retailer Choice Act (119) | Permit year-round E15 (higher-ethanol) fuel sales | `[v topic+dir]` |
| CRA disapprovals: SJRES11 / HJRES30 / HJRES39 (118) | Repeal a specific named federal regulation (identify each) | + `[v per-rule]` |

### National Security & Borders — well covered
| Bill (Cong) | Yea expresses (draft, neutral) | Lean |
|---|---|---|
| HR2 Secure the Border Act (118) | Tighten border enforcement and asylum/parole limits | + `[v]` |
| HR30 Preventing Violence Against Women by Illegal Aliens Act (119) | Add immigration-enforcement consequences for certain offenses | + `[v]` |
| HR2056 DC Federal Immigration Compliance Act (119) | Require DC to cooperate with federal immigration enforcement | + `[v]` |
| HR5525 Spending Reduction and Border Security Act (118) | Pair border-security measures with spending reductions | + `[v]` |

### Rights & Justice — well covered
| Bill (Cong) | Yea expresses (draft, neutral) | Lean |
|---|---|---|
| HR28 Protection of Women and Girls in Sports Act (119) | Define sex-based eligibility for women's/girls' scholastic sports | + `[v]` |
| HR1041 Veterans 2nd Amendment Protection Act (119) | Restrict reporting certain veterans to the gun-background-check system | + `[v]` |
| HJRES24 Disapprove DC Council criminal-code revision (118) | Block DC's revised criminal code | + `[v]` |
| HR26 Born-Alive Abortion Survivors Protection Act (118) | Add care requirements re: infants born during attempted abortion | + `[v]` |
| *(HR734, 118 = prior-Congress twin of HR28 — use as consistency check, not a 2nd vote)* | | |

### Economy & Work — thin, needs a targeted pull
| Bill (Cong) | Yea expresses (draft, neutral) | Lean |
|---|---|---|
| HR23 Family and Small Business Taxpayer Protection Act (118) | Rescind expanded IRS funding/enforcement | + `[v]` |
| HR4690 Reliable Federal Infrastructure Act (119) | Streamline NEPA/permitting reviews for projects | `[v topic+dir]` |
| HR1163 Protecting Taxpayers and Victims of Unemployment Fraud Act (118) | Recover pandemic UI fraud (possible valence) | `[v — may drop]` |
> Gap: need clean **tax / labor / wage / trade** final-passage votes. Targeted pull required.

### Health, Education & Welfare — thin, needs a targeted pull
| Bill (Cong) | Yea expresses (draft, neutral) | Lean |
|---|---|---|
| HR6359 Pregnant Students' Rights Act (119) | Require schools to inform pregnant students of rights/resources | `[v]` |
| HR6703 Lower Health Care Premiums for All Americans Act (119) | Change ACA subsidy/premium rules (identify direction) | `[v dir]` |
| HR2262 Flexibility for Workers Education Act (119) | Adjust workforce/education program rules | `[v — may drop]` |
> Gap: need clean **ACA / Medicaid / drug-pricing / education-funding** votes. Targeted pull required.

### Government & Democracy — still the gap (auto-tag unusable)
No clean key votes surfaced; the topic bucket is noise. Requires a **search by policy identity**, not
the tag — candidate areas: **elections/voter eligibility (e.g., SAVE Act), ethics, the Rescissions
Act (HR4, 119 — executive vs. congressional spending power), Congressional Review Act usage, term
limits.** To be filled before launch; until then this topic shows *"insufficient record."*

## What I need from you next

1. **Sanity-check the hand-assigned topics** above (esp. HR1346 Economy-vs-Environment; HR1041 in
   Rights).
2. **Confirm the summary source:** I'll fetch official summaries from **Congress.gov** for the
   shortlist to finalize neutral one-liners + lean. OK to proceed?
3. **Green-light the targeted pulls** for Economy, Health, and Government & Democracy (search by
   policy area to reach ≥3–5 clean votes each).

Once you confirm, I verify each direction against the official summary, then run the neutrality gate
(`alignment-quiz-reviewer` + `brand-voice-reviewer`) before anything scores a real person.
