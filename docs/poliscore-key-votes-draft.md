# PoliScore Key Votes — v3.1 (verified + neutrality-reviewed)

> The neutrality-critical artifact: which roll-call votes define each topic's directional score and
> which way each leans. Directions **verified against Congress.gov** (2026-06-16) and passed through
> the neutrality gate (`brand-voice-reviewer`) + scoring gate (`alignment-quiz-reviewer`); their
> fixes are applied below. See [`poliscore-methodology.md`](./poliscore-methodology.md).

## Scope (who these score)

Federal key votes → score **both NC and NJ congressional delegations** with no extra curation (16 NC
+ 14 NJ ≈ 30 members). NC is the public beachhead + state-leg build; NJ federal is in for home-turf
dogfooding + 2026 House races; NJ state legislature parked for 2027.

## Rules

- Ship **v0.0 first**; `Not Voting` is a **separate** metric; **appropriations/omnibus excluded**;
  **topic hand-assigned** (auto-tag unreliable). Lean maps to the quiz axis (**− left ↔ + right**).
- **Display rule (neutrality):** official bill titles are **sponsor-assigned** and are NOT shown as
  the score's framing. The **neutral description is canonical**; titles appear only as labeled
  reference. Public pages carry the disclaimer: *"Left/Right describes the policy direction of a vote
  on a disclosed axis — not a judgment of which direction is correct."*

## The rubric (verified, neutral descriptions canonical)

### Economy & Work
| Bill (Cong) | A **Yea** does (canonical, neutral) | Lean |
|---|---|---|
| HR23 (118) *[title: Family and Small Business Taxpayer Protection Act]* | Rescind certain unobligated IRA funds for IRS enforcement/operations/direct-file | + |
| HR2965 (119) *[title: Small Business Regulatory Reduction Act]* | Cap the SBA small-business regulatory cost budget at ≤ zero; report compliance costs | + |
| HR1163 (118) *[title: Protecting Taxpayers and Victims of Unemployment Fraud Act]* | Let states retain a share of recovered UI overpayments; extend the fraud statute of limitations to 10 years | + |
| **HR5408 (119) *[title: Faster Labor Contracts Act]*** | Impose first-contract bargaining deadlines, then mediation/binding arbitration | **−** |

### Environment & Energy
| Bill (Cong) | A **Yea** does | Lean |
|---|---|---|
| HR4758 (119) *[title: Homeowner Energy Freedom Act]* | Repeal DOE IRA home-electrification rebate/code programs; rescind unobligated funds | + |
| HR1366 (119) *[title: Mining Regulatory Clarity Act]* | Allow hardrock mining ancillary use of federal land regardless of mineral presence | + |
| HR4468 (118) *[title: Choice in Automobile Retail Sales Act]* | Bar EPA from enforcing certain MY2027+ vehicle-emissions rules that limit gas-car availability | + |
| HR1346 (119) *[title: Nationwide Consumer & Fuel Retailer Choice Act]* *(mixed cross-party support — weighted lower)* | Allow year-round E15 gasoline sales | + |

### National Security & Borders
| Bill (Cong) | A **Yea** does | Lean |
|---|---|---|
| HR2 (118) *[title: Secure the Border Act]* | Resume border-wall construction; raise the asylum bar; expand detention/expedited removal | + |
| HR30 (119) *[title: Preventing Violence Against Women by Illegal Aliens Act]* | Make noncitizens with sex-offense, domestic-violence, or stalking convictions inadmissible and deportable | + |
| HR2056 (119) *[title: DC Federal Immigration Compliance Act]* | Bar DC sanctuary policies that limit cooperation with federal immigration enforcement | + |

### Rights & Justice
| Bill (Cong) | A **Yea** does | Lean |
|---|---|---|
| HR28 (119) *[title: Protection of Women and Girls in Sports Act]* | Define "sex" under Title IX as determined at birth; bar athletes assigned male at birth from female-designated school sports | + |
| HR1041 (119) *[title: Veterans 2nd Amendment Protection Act]* | Require a judicial danger finding before the VA reports a beneficiary to the firearms background-check system | + |
| HR26 (118) *[title: Born-Alive Abortion Survivors Protection Act]* | Require medical care for any infant born alive after an attempted abortion; impose criminal penalties on providers who fail to provide it | + |

### Health, Education & Welfare
| Bill (Cong) | A **Yea** does | Lean |
|---|---|---|
| HR6359 (119) *[title: Pregnant Students' Rights Act]* | Require colleges to inform students of rights/resources for carrying a pregnancy to term | + |
| HR498 (119) *[title: Do No Harm in Medicaid Act]* | Bar federal Medicaid payment for specified gender-transition procedures for individuals under 18 | + |
| HR485 (118) *[title: Protecting Health Care for All Patients Act]* | Bar federal health programs from using quality-adjusted life years (QALYs) in coverage decisions | + |
| HR6703 (119) *[title: Lower Health Care Premiums for All Americans Act]* | Establish association-health-plan rules + pharmacy-benefit-manager standards (party-line) | + |
| HR497 (118) *[title: Freedom for Health Care Workers Act]* | Repeal and block the HHS COVID-19 vaccination mandate for Medicare/Medicaid providers | + |

### Government & Democracy
| Bill (Cong) | A **Yea** does | Lean |
|---|---|---|
| HR4 (119) *[title: Rescissions Act of 2025]* | Cancel ~$6.9B in unobligated budget authority across multiple accounts, per a presidential rescission request | + |
| HR884 (119) | Bar noncitizens from voting in DC local elections; repeal DC's 2022 law | + |
| HR5125 (119) *[title: DC Judicial Nominations Reform Act]* | End the DC Judicial Nomination Commission; give the President sole authority to appoint DC judges | + |
| HR288 (118) *[title: Separation of Powers Restoration Act]* *(structural)* | Require de novo judicial review of agency legal interpretations (end Chevron deference) | + |

## 🚧 HARD GATE — left/right balance (blocks v0.1 launch)

The rubric is currently **~22 right-coded : 1 left-coded** (only HR5408), an artifact of the 119th
R-majority House floor agenda. The mechanics stay symmetric (a Nay on a right-coded bill correctly
maps left), but a published rubric that is ~96% one-sided is a neutrality-perception risk regardless
of math. **Per the brand-voice gate, this is now a hard launch gate, not a goal:**

> **Requirement: ≥ 2 left-coded key votes per topic (≈12 total) before v0.1 scores anyone publicly.**

Sources to mine for left-coded contested votes: 118th-Congress Democratic-majority passages,
Senate-originated bills, House suspension/discharge votes Democrats led, and motions where the
delegation split with Democrats on the Yea side. **Status: in progress (next data pull).**

## Neutrality fixes applied (from the gate)

- **Sponsor titles no longer framed as the score** — shown only as labeled `[title: …]` reference;
  neutral description is canonical (fixes HR30 "Illegal Aliens", HR1163 "Victims of … Fraud").
- **HR28** rewritten → "athletes assigned male at birth" (drops identity-contested wording).
- **HR26** rewritten → mechanical statutory obligation (drops "newborn-equivalent care" gloss).
- **HR4** "mostly foreign aid" dropped (unsourced characterization) → "across multiple accounts."
- **HR1346** "farm-state valence" jargon removed → "mixed cross-party support — weighted lower."
- Public-page **Left/Right disclaimer** added to the Display rule above.

## Earlier corrections / drops

- **HJRES24** dropped (mislabeled in draft + duplicates HR884). **HR288** → Government & Democracy.
  **HR5525** dropped (continuing resolution). **HR2670/HR4016/HR6945/HR1329/HRES863** previously cut.

## Remaining before v0.1 ships

1. **Clear the hard gate** above (≥2 left-coded per topic).
2. Implement the scoring-gate hardening locked in `poliscore-methodology.md` (per-member
   participation floor; dedicated `poliscore_*` storage; "N of M cast" display).
3. Re-run both gate reviewers on the balanced rubric.
