# PoliScore Key Votes — v3 (verified)

> The neutrality-critical artifact: which roll-call votes define each topic's directional score and
> which way each leans. Per [`poliscore-methodology.md`](./poliscore-methodology.md), every entry
> ships with source + rationale and is open to challenge. Directions below were **verified against
> Congress.gov** (2026-06-16). Remaining gate before anything scores a real person: neutrality review
> (`alignment-quiz-reviewer` + `brand-voice-reviewer`).

## Scope (who these score)

These are **federal** key votes, so they score **both NC and NJ congressional delegations** with no
extra curation — 16 NC + 14 NJ = ~30 members. (NC is the public/marketing beachhead + the
state-legislature build; NJ federal is included for home-turf dogfooding and its 2026 House races.
NJ state legislature is parked for the 2027 cycle.)

## Decisions locked

Ship **v0.0 first**; `Not Voting` is a **separate** metric; **appropriations/omnibus excluded**;
**topic hand-assigned** (auto-tag unreliable). Lean maps to the quiz axis (**− left ↔ + right**).

## The rubric (verified)

### Economy & Work
| Bill (Cong) | A **Yea** does (verified, neutral) | Lean |
|---|---|---|
| HR23 Family and Small Business Taxpayer Protection Act (118) | Rescind certain unobligated IRA funds for IRS enforcement/operations/direct-file | + |
| HR2965 Small Business Regulatory Reduction Act (119) | Cap the SBA small-business regulatory cost budget at ≤ zero; report compliance costs | + |
| HR1163 Protecting Taxpayers and Victims of Unemployment Fraud Act (118) | Let states retain a share of recovered UI overpayments; extend fraud statute to 10 yrs | + |
| **HR5408 Faster Labor Contracts Act (119)** | Impose first-contract bargaining deadlines, then mediation/binding arbitration | **−** |

### Environment & Energy
| Bill (Cong) | A **Yea** does | Lean |
|---|---|---|
| HR4758 Homeowner Energy Freedom Act (119) | Repeal DOE IRA home-electrification rebate/code programs; rescind unobligated funds | + |
| HR1366 Mining Regulatory Clarity Act (119) | Allow hardrock mining ancillary use of federal land regardless of mineral presence | + |
| HR4468 Choice in Automobile Retail Sales Act (118) | Bar EPA from enforcing certain MY2027+ vehicle-emissions rules limiting gas cars | + |
| HR1346 Nationwide Consumer & Fuel Retailer Choice Act (119) *(weak signal — farm-state valence)* | Allow year-round E15 gasoline sales | + |

### National Security & Borders
| Bill (Cong) | A **Yea** does | Lean |
|---|---|---|
| HR2 Secure the Border Act (118) | Resume border-wall construction; raise asylum bar; expand detention/expedited removal | + |
| HR30 Preventing Violence Against Women by Illegal Aliens Act (119) | Make noncitizens who committed sex/DV/stalking offenses inadmissible & deportable | + |
| HR2056 DC Federal Immigration Compliance Act (119) | Bar DC sanctuary policies limiting cooperation with federal immigration enforcement | + |

### Rights & Justice
| Bill (Cong) | A **Yea** does | Lean |
|---|---|---|
| HR28 Protection of Women and Girls in Sports Act (119) | Define Title IX sex by birth biology; bar trans women/girls from female school sports | + |
| HR1041 Veterans 2nd Amendment Protection Act (119) | Require a judicial danger finding before VA reports a beneficiary to NICS | + |
| HR26 Born-Alive Abortion Survivors Protection Act (118) | Require newborn-equivalent care for an infant who survives an abortion; criminal penalties | + |

### Health, Education & Welfare
| Bill (Cong) | A **Yea** does | Lean |
|---|---|---|
| HR6359 Pregnant Students' Rights Act (119) | Require colleges to inform students of rights/resources for carrying a pregnancy to term | + |
| HR498 Do No Harm in Medicaid Act (119) | Bar federal Medicaid payment for specified gender-transition procedures for minors | + |
| HR485 Protecting Health Care for All Patients Act (118) | Bar federal health programs from using QALYs in coverage/payment decisions | + |
| HR6703 Lower Health Care Premiums for All Americans Act (119) | Establish association-health-plan rules + PBM standards (party-line; right-coded) | + |
| HR497 Freedom for Health Care Workers Act (118) | Repeal and block the HHS COVID-19 vaccination mandate for Medicare/Medicaid providers | + |

### Government & Democracy
| Bill (Cong) | A **Yea** does | Lean |
|---|---|---|
| HR4 Rescissions Act of 2025 (119) | Cancel ~$6.9B unobligated budget authority (mostly foreign aid) per the rescission request | + |
| HR884 Prohibit noncitizen voting in DC (119) | Bar noncitizens from voting in DC local elections; repeal DC's 2022 law | + |
| HR5125 DC Judicial Nominations Reform Act (119) | End the DC Judicial Nomination Commission; give the President sole DC-judge appointment | + |
| HR288 Separation of Powers Restoration Act (118) *(structural — courts review agency law de novo / ends Chevron)* | Require de novo judicial review of agency legal interpretations | + |

## ⚠️ Open neutrality issue (for the gate)

**The rubric leans heavily on Republican-sponsored bills** (only HR5408 is left-coded). That's a real
artifact of the **119th R-majority House setting the floor agenda** — contested floor votes are
mostly GOP bills. This does **not** bias the *score mechanics* (a Nay correctly maps left, a Yea
right, symmetrically), but it does shape the *axis framing* and is a perception risk for a neutrality
brand. **Mitigation to pursue before launch:** actively add more left-coded contested votes
(e.g., Democratic-led suspension/discharge votes, 118th-Congress items, Senate-originated bills) so
each topic has both poles represented. Flagged explicitly for `brand-voice-reviewer` +
`alignment-quiz-reviewer`.

## Applied corrections / drops (from verification)

- **HJRES24** — dropped: my draft title ("criminal-code revision") was wrong (it's DC noncitizen
  voting = HJRES26), and it **duplicates HR884**. Rights & Justice still meets floor (3).
- **HR288** — moved Environment → **Government & Democracy** (Chevron/structural).
- **HR5525** — dropped (it's a continuing resolution; excluded under the appropriations rule).
- **HR2670 (NDAA), HR4016, HR6945, HR1329, HRES863** — previously cut (omnibus / valence / non-policy).

## Remaining steps

1. Run the **neutrality gate** (`alignment-quiz-reviewer` + `brand-voice-reviewer`) on this rubric.
2. Pursue the **left-coded-vote balancing** above.
3. Implement v0.1 scoring per `poliscore-methodology.md` once the gate passes.
