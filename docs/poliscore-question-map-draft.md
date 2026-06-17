# PoliScore → Quiz Question Map — DRAFT for owner review

> **STATUS: DRAFT — DO NOT IMPLEMENT DOWNSTREAM.**
> This document maps the 28 approved `poliscore_key_votes` to the specific alignment-quiz
> `question_id`(s) each vote legitimately answers. It is the mandatory human-reviewed gate
> before any NC/NJ candidate answer can be re-derived from a verified vote.
>
> The methodology forbids auto-bucketing: a vote on a topic does NOT automatically answer
> every question in that topic area. Each mapping below must be approved individually.
>
> **Axis convention** (from `scripts/answers-enrichment/README.md` and `src/lib/scoring.ts`):
> answer_value is on a −10..+10 scale; **−1 = left, +1 = right** (same sign as `lean`).
> A **Yea on a `right`-lean bill → positive answer_value** (right-of-center).
> A **Yea on a `left`-lean bill → negative answer_value** (left-of-center).
> **Magnitude** is a separate decision (see Open Questions §1 below); this draft proposes ±8
> ("strong" but not maximum) as a default for party-line key votes, pending owner approval.

---

## Section 1: Economy & Work (6 key votes)

---

### HR23 (118) — Family and Small Business Taxpayer Protection Act
**Lean:** right (+) | **A Yea does:** Rescinds certain unobligated IRA funds for IRS enforcement, operations, and direct-file

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `economy-q7` | "Should the federal government prioritize reducing the national debt?" | +8 (right) | Rescinding IRS appropriations is a federal spending-reduction action; keywords include "cut federal spending" which maps to economy-q7 axis=+1 | MEDIUM — the bill rescues funds specifically from IRS (not general debt reduction); the connection is real but indirect. The bill's policy content is IRS enforcement capacity, not deficit reduction per se. **Flag for owner.** |
| `economy-q19` | "Should the corporate tax rate be increased or decreased?" | +8 (right) | The IRS enforcement rescission weakens tax-collection capacity, consistent with the right/lower-taxes axis; the TCJA-permanency keyword pattern matches axis=+1 for this question | LOW-MEDIUM — the bill doesn't set a tax rate and there is no direct keyword hit in `question-bill-keywords.ts` for HR23's title. The logic is inference, not title-match. **NEEDS-REVIEW: consider 0 mappings if the methodology requires a keyword hit.** |

> **Proposed mapping: economy-q7 only, at +8. economy-q19 is a stretch — flag.**

---

### HR1163 (118) — Protecting Taxpayers and Victims of Unemployment Fraud Act
**Lean:** right (+) | **A Yea does:** Lets states retain a share of recovered UI overpayments; extends the UI fraud statute of limitations to 10 years

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `economy-q10` | "Should the government create a stronger automatic stabilizer system?" | +8 (right) | The bill modifies UI overpayment recovery rules, touching the UI/automatic-stabilizer infrastructure — but in the direction of tightening fraud recovery, not expanding stabilizers. The `economy-q10` keyword rule uses "unemployment insurance modernization / automatic stabilizer" at axis=−1; a Yea here runs opposite to that intent | LOW — keyword pattern exists for this question, but this bill's Yea direction opposes expanding stabilizers. Could attach answer_value=+8 (right: reduce UI generosity). **NEEDS-REVIEW: Is this question a legitimate answer anchor for a fraud-statute bill, or is it too oblique?** |

> **Proposed mapping: 0 questions. The bill's substance (fraud recovery timelines, state-retention shares) does not cleanly answer any single quiz question. OWNER DECISION NEEDED.**

---

### HR2312 (119) — Tipped Employee Protection Act
**Lean:** left (−) | **A Yea does:** Protects tipped-worker wage rules

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `economy-q15` | "Should the federal minimum wage be increased?" | −8 (left) | The bill protects tipped-worker wage floors, which is in the same policy family as minimum-wage protection. The `economy-q15` keyword rule ("raise the wage," "minimum wage," "living wage," axis=−1) is not a literal title match, but the substantive connection is direct: tipped-minimum-wage protection is a subset of federal wage-floor policy | MEDIUM — no exact keyword hit on the bill title ("Tipped Employee Protection Act"), but the subject matter is squarely wage-floor protection. The keyword "minimum wage" doesn't appear in the title. **Flag: confirm with owner whether non-title-match is acceptable for vote-derived answers (it should be, since this is the vote-map, not the citation-enrichment).** |
| `economy-q16` | "Should federal law make it easier to unionize?" | −8 (left) | Tipped-worker protections often co-travel with collective-bargaining legislation, but this bill is about wage rules, not union organizing rights | LOW — do not map. Different policy mechanism. |

> **Proposed mapping: economy-q15 at −8. Confirm that non-keyword-title match is acceptable for the vote map.**

---

### HR2550 (119) — Protect America's Workforce Act
**Lean:** left (−) | **A Yea does:** Pro-union labor protections

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `economy-q16` | "Should federal law make it easier to unionize?" | −8 (left) | Direct substantive match. The `economy-q16` keyword rule includes "right to organize," "collective bargaining," axis=−1; "pro-union labor protections" is squarely in scope | HIGH |
| `economy-q15` | "Should the federal minimum wage be increased?" | −8 (left) | Pro-union legislation can affect wages, but this is a separate question with a different mechanism | LOW — do not map. |

> **Proposed mapping: economy-q16 at −8. HIGH confidence.**

---

### HR2965 (119) — Small Business Regulatory Reduction Act
**Lean:** right (+) | **A Yea does:** Caps the SBA small-business regulatory cost budget at ≤ zero; requires compliance-cost reporting

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `government-q18` | "Should federal agencies be required to reduce red tape targets?" | +8 (right) | Direct substantive match. The `government-q18` keyword rule uses "regulatory relief," "reducing regulatory burdens," "red tape," axis=+1. This bill imposes a zero-cost-budget cap on SBA regulations — precisely a regulatory-reduction mandate | HIGH |
| `economy-q7` | "Should the federal government prioritize reducing the national debt?" | +8 (right) | The bill is about regulatory burden reduction, not debt | LOW — do not map. Topic mismatch. |

> **Proposed mapping: government-q18 at +8. HIGH confidence. Note: this is a Government topic question, not Economy — the bill is in the economy-work topic of the key vote rubric, but its quiz answer lands in the government topic. That is correct per methodology (answer the question the vote actually speaks to, not the rubric topic bucket).**

---

### HR5408 (119) — Faster Labor Contracts Act
**Lean:** left (−) | **A Yea does:** Imposes first-contract bargaining deadlines; requires mediation/binding arbitration if no agreement

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `economy-q16` | "Should federal law make it easier to unionize?" | −8 (left) | Direct match. First-contract arbitration mandates are a core pro-union labor policy. The `economy-q16` keyword rule ("right to organize," "collective bargaining," axis=−1) covers this. Requiring binding arbitration to reach first contracts materially aids unionization | HIGH |

> **Proposed mapping: economy-q16 at −8. HIGH confidence.**

---

## Section 2: Environment & Energy (4 key votes)

---

### HR4468 (118) — Choice in Automobile Retail Sales Act
**Lean:** right (+) | **A Yea does:** Bars EPA from enforcing certain MY2027+ vehicle-emissions rules that limit gas-car availability

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `environment-q9` | "Should the federal government impose stricter emissions standards on power plants?" | +8 (right) | Partial — this bill blocks vehicle emissions standards, not power-plant standards. environment-q9 is specifically about power plants (keyword: "emissions standard," "carbon pollution," "clean power," axis=−1). Vehicle emissions are a different regulatory domain | LOW-MEDIUM — emissions standards are topically related but the question text specifies power plants. **NEEDS-REVIEW: does the quiz treat "emissions standards" broadly (covering both vehicle and power plant rules) or narrowly?** |
| `environment-q8` | "Should federal policy limit new oil and gas drilling leases?" | +8 (right) | The environment-q8 keyword rule has axis=+1 for "unleashing american energy," "american energy independence," "expand offshore leasing" — the bill's intent (preserve consumer gas-vehicle access, block EPA emissions enforcement) fits the right/fossil-fuel-friendly axis | MEDIUM — the question asks specifically about "drilling leases," which is a different mechanism from vehicle emissions rules. Subject-matter overlap is real but imprecise. **Flag for owner.** |

> **Proposed mapping: NONE at HIGH confidence. NEEDS-REVIEW — owner must decide whether vehicle-emissions blocking maps to environment-q9 (power-plant framing) or environment-q8 (drilling/energy-access framing), or neither. A forced mapping here risks the "don't auto-bucket" rule.**

---

### HR1346 (119) — Nationwide Consumer and Fuel Retailer Choice Act
**Lean:** right (+) | **A Yea does:** Allows year-round E15 gasoline sales (ethanol blend)

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `environment-q8` | "Should federal policy limit new oil and gas drilling leases?" | +8 (right) | E15 expands fuel options and reduces pressure to limit fossil fuels, consistent with the right/energy-access axis on environment-q8 (keyword rule axis=+1 for energy independence/access). But the question specifically asks about drilling leases, not fuel-blend regulations | LOW — E15 policy is about blending fuel, not drilling. The policy mechanism and question subject are different. **Do not map.** |

> **Proposed mapping: 0 questions. E15 year-round sales is a fuel-blend/agriculture policy issue; none of the quiz questions clearly ask about this specific mechanism. NEEDS-REVIEW: if the owner reads environment-q8 broadly as "fossil-fuel-access policy," this could map at LOW confidence.**

---

### HR1366 (119) — Mining Regulatory Clarity Act
**Lean:** right (+) | **A Yea does:** Allows hardrock mining ancillary use of federal land regardless of mineral presence

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `environment-q16` | "Should Congress restrict mineral extraction on public lands?" | +8 (right) | Direct substantive match. The bill expands mining access on federal lands — a Yea votes against restricting mineral extraction. The `environment-q16` keyword rule uses "mining reform," "hardrock mining," axis=−1; a Yea here runs opposite (right, +1) | HIGH — axis inversion is correct: Yea on a right-lean mining-access bill → answer_value positive (opposes restriction). The question is "Should Congress restrict..." so Yea on this bill = "No" to restriction = right-of-center |

> **Proposed mapping: environment-q16 at +8. HIGH confidence.**

---

### HR4758 (119) — Homeowner Energy Freedom Act
**Lean:** right (+) | **A Yea does:** Repeals DOE IRA home-electrification rebate and building-code programs; rescinds unobligated funds

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `environment-q7` | "Should the U.S. expand renewable energy subsidies?" | +8 (right) | Direct substantive match. The bill repeals home-electrification rebates — IRA energy-efficiency programs that are a subset of clean-energy subsidies. The `environment-q7` keyword rule ("renewable energy," "clean energy," axis=−1) covers the repeal's target; a Yea on repeal → right-of-center on this axis | HIGH |

> **Proposed mapping: environment-q7 at +8. HIGH confidence.**

---

## Section 3: Government & Democracy (5 key votes)

---

### HR288 (118) — Separation of Powers Restoration Act
**Lean:** right (+) | **A Yea does:** Requires de novo judicial review of agency legal interpretations (ends Chevron deference)

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `jud-06` | "How much deference should courts give to executive agency interpretations of laws?" | +8 (right) | Exact substantive match. This bill directly ends Chevron deference — courts must interpret laws independently. The `jud-06` keyword rule ("regulations from the executive in need of scrutiny," "separation of powers restoration," axis=+1) is a literal title match ("Separation of Powers Restoration Act") | HIGH — perfect alignment: bill title, keyword rule, and question subject are identical in substance. |
| `government-q18` | "Should federal agencies be required to reduce red tape targets?" | +8 (right) | The bill is about judicial deference, not regulatory reduction targets; this question asks a different thing | LOW — do not map. |

> **Proposed mapping: jud-06 at +8. HIGH confidence. Note: jud-06 is in the "judicial" topic — confirm this topic is active in the current questions table before implementing.**

---

### HR4 (119) — Rescissions Act of 2025
**Lean:** right (+) | **A Yea does:** Cancels ~$6.9B in unobligated budget authority across multiple accounts per a presidential rescission request

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `economy-q7` | "Should the federal government prioritize reducing the national debt?" | +8 (right) | Spending rescissions directly reduce federal expenditures, consistent with fiscal-restraint axis. Keywords "cut federal spending," "spending caps" are on this question at axis=+1 | MEDIUM — the connection is substantive (spending reduction), but the bill is an executive rescission of specific unobligated accounts, not a structural debt-reduction policy. The map is directionally correct but the magnitude of the question's scope vs. the bill's scope is mismatched. **Flag for owner.** |
| `economy-q9` | "Should federal budget rules be tightened to curb deficits?" | +8 (right) | Similar reasoning — rescissions reduce spending, which is consistent with deficit control | MEDIUM — same caveat as economy-q7: this is one-time spending rescission, not a budget rule. **Flag for owner.** |

> **Proposed mapping: economy-q7 at +8, MEDIUM confidence. economy-q9 is arguably a stretch (it asks about budget rules, not spending cuts). Owner should choose one or neither.**

---

### HJRES72 (119) — Terminating a national emergency declaration
**Lean:** left (−) | **A Yea does:** Disapproves a presidential emergency declaration (Congress asserts checks-and-balances role)

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `government-q19` | "Should Congress increase oversight of executive agencies?" | −8 (left) | A joint resolution terminating a presidential emergency is precisely a form of congressional oversight of executive power. A Yea supports Congress asserting its check on executive emergency declarations | MEDIUM — the question asks about "oversight of executive agencies," which is somewhat different from checking presidential emergency declarations. The vote is about congressional vs. executive power, which aligns directionally but the question's framing ("agencies") is narrower than the bill's target (presidential declaration) |
| `government-q21` | "Should Congress act to overturn Citizens United and limit super PAC spending?" | No match | Different subject entirely | — |

> **Proposed mapping: government-q19 at −8, MEDIUM confidence. NEEDS-REVIEW: the question's "agencies" language vs. presidential emergency declarations is a stretch. If no question clearly covers "congressional checks on executive emergency powers," this may be 0 mappings. Flag for owner.**

---

### HR884 (119) — Prohibit noncitizen voting in DC
**Lean:** right (+) | **A Yea does:** Bars noncitizens from voting in DC local elections; repeals DC's 2022 law

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `civil-rights-q7` | "Should voting rights protections be strengthened nationwide?" | +8 (right) | The `civil-rights-q7` keyword rule includes "safeguard american voter," "voter id," axis=+1 for right-coded voting-restriction measures. Prohibiting noncitizen voting is a voting-restriction/election-integrity measure consistent with the right-axis of this question | MEDIUM — the question asks about "voting rights protections" (typically framed as expansion), but the axis=+1 option in the keyword rule explicitly covers restriction measures. The bill targets a specific DC context, not a nationwide standard. **Flag: the DC-specific scope is narrow; does it answer a nationwide question?** |

> **Proposed mapping: civil-rights-q7 at +8, MEDIUM confidence. Scope caveat (DC-only) must be noted in any candidate-answer provenance.**

---

### HR5125 (119) — DC Judicial Nominations Reform Act
**Lean:** right (+) | **A Yea does:** Ends the DC Judicial Nomination Commission; gives the President sole authority to appoint DC judges

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `jud-06` | "How much deference should courts give to executive agency interpretations of laws?" | Possibly +8 | The bill is about presidential appointment power over DC judges, which touches executive-judicial relations but is about appointments, not Chevron-style interpretive deference | LOW — different legal mechanism. Do not map. |

> **Proposed mapping: 0 questions. This bill's subject (DC judicial appointment process) does not map cleanly to any quiz question. NEEDS-REVIEW: confirm 0 mapping is the right call.**

---

## Section 4: Health, Education & Welfare (6 key votes)

---

### HR485 (118) — Protecting Health Care for All Patients Act
**Lean:** right (+) | **A Yea does:** Bars federal health programs from using quality-adjusted life years (QALYs) in coverage decisions

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `healthcare-q11` | "Should the federal government expand access to public health insurance?" | +8 (right) | The QALY prohibition affects how public health programs set coverage priorities — a Yea restricts a methodology used in public-payer cost-effectiveness analysis. This is right-coded (restrict public program decision tools) | LOW-MEDIUM — the question asks about expanding access, not about coverage-decision methodology. The connection is indirect. **NEEDS-REVIEW.** |

> **Proposed mapping: 0 questions at HIGH confidence. The QALY prohibition is a technical coverage-methodology issue; no quiz question directly addresses QALYs or cost-effectiveness research in federal health programs. Forcing a map risks the anti-auto-bucketing rule. Flag for owner.**

---

### HR497 (118) — Freedom for Health Care Workers Act
**Lean:** right (+) | **A Yea does:** Repeals and blocks the HHS COVID-19 vaccination mandate for Medicare/Medicaid providers

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `healthcare-q11` | "Should the federal government expand access to public health insurance?" | +8 (right) | Repealing a provider vaccination mandate is a right-coded public-health-policy action, but the question asks about insurance expansion, not mandates | LOW — subject mismatch. Do not map. |
| `healthcare-q15` | "Should the U.S. increase investment in public health infrastructure?" | +8 (right) | Repealing a public-health mandate runs opposite to expanding public health infrastructure (axis=−1 for investment). A Yea here → right (reduce public health requirements) | MEDIUM — the bill is about provider mandates specifically; the question is about public health investment broadly. The directional coding is correct (+8) but the policy mechanism is narrow (mandate repeal) vs. the question's broad framing | 

> **Proposed mapping: healthcare-q15 at +8, LOW-MEDIUM confidence. NEEDS-REVIEW: the vaccine-mandate repeal is a very specific policy action that may be too narrow to answer "Should the U.S. increase investment in public health infrastructure?" Consider 0 mappings.**

---

### HR498 (119) — Do No Harm in Medicaid Act
**Lean:** right (+) | **A Yea does:** Bars federal Medicaid payment for specified gender-transition procedures for individuals under 18

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `civil-rights-q9` | "Should protections for LGBTQ+ individuals be codified in federal law?" | +8 (right) | Direct substantive match. Barring Medicaid coverage for gender-transition care for minors is a right-coded policy on the LGBTQ+/gender-identity axis. The `civil-rights-q9` keyword rule covers "sexual orientation," axis=−1 for expansions; a Yea here → right | HIGH — the vote directly answers where a candidate stands on LGBTQ+ healthcare policy, which is a core civil-rights-q9 dimension. |

> **Proposed mapping: civil-rights-q9 at +8. HIGH confidence.**

---

### HR2270 (119) — Empowering Employer Child and Elder Care Solutions Act
**Lean:** left (−) | **A Yea does:** Supports employer-sponsored child/elder-care benefits

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `healthcare-q3` | "Should the U.S. provide universal childcare subsidies?" | −8 (left) | The `healthcare-q3` keyword rule uses "child care for working families," "universal child care," "child care access," axis=−1. This bill promotes employer-based child-care solutions — a left-coded vote in that it expands child/elder care access, though via employer mechanism rather than direct government provision | MEDIUM — the bill uses an employer-based (not universal/government) mechanism. The question asks about "universal childcare subsidies," which is different from employer benefit expansion. A Yea here supports expanding child-care access but through tax incentives/employer channels. **Flag: is employer-based child care a genuine answer to the "universal" childcare question, or does that distinction matter for alignment scoring?** |

> **Proposed mapping: healthcare-q3 at −8, MEDIUM confidence. NEEDS-REVIEW: employer-based vs. universal distinction. Owner must decide.**

---

### HR6359 (119) — Pregnant Students' Rights Act
**Lean:** right (+) | **A Yea does:** Requires colleges to inform students of rights and resources for carrying a pregnancy to term

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `civil-rights-q22` | "Should federal law protect the right to abortion nationwide?" | +8 (right) | The bill promotes pregnancy continuation (informing students of resources for carrying to term) — a right-coded position on the abortion/reproductive-rights axis. The `civil-rights-q22` keyword rule includes "born-alive," "life at conception" at axis=+1. This bill is pro-life-leaning in policy direction | MEDIUM — the bill requires disclosure of resources, not an abortion restriction per se. However, it is part of the right-coded abortion policy cluster (pro-carrying-to-term). The map is defensible but the bill's mechanism (disclosure) is softer than the question's framing (federal law protecting abortion rights). **Flag for owner.** |

> **Proposed mapping: civil-rights-q22 at +8, MEDIUM confidence. The disclosure mechanism is weaker than a direct restriction; answer_value could reasonably be +5 rather than +8. Owner should set magnitude.**

---

### HR6703 (119) — Lower Health Care Premiums for All Americans Act
**Lean:** right (+) | **A Yea does:** Establishes association-health-plan rules + pharmacy-benefit-manager standards (party-line)

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `healthcare-q11` | "Should the federal government expand access to public health insurance?" | +8 (right) | Association health plans are a market-based alternative to government insurance expansion — a right-coded health policy approach | MEDIUM — the question asks about "public health insurance," but association health plans are private. A Yea supports a market-based premium-reduction approach, which is directionally right but the question's framing (public insurance) is distinct from the bill's mechanism (private association plans). **Flag for owner.** |
| `healthcare-q12` | "Should Congress allow Medicare to negotiate drug prices?" | +8 (right) | The PBM provisions in this bill address pharmacy pricing, but the question specifically asks about Medicare drug negotiation, which is a different (and opposite-direction) mechanism. A Yea on this bill does not answer the Medicare negotiation question | LOW — do not map; mechanism mismatch. |

> **Proposed mapping: healthcare-q11 at +8, MEDIUM confidence. NEEDS-REVIEW: the public-vs.-private distinction in the question vs. bill mechanism. Alternatively, 0 mappings if the association-plan/public-insurance gap is too large.**

---

## Section 5: National Security & Borders (4 key votes)

---

### HR2 (118) — Secure the Border Act
**Lean:** right (+) | **A Yea does:** Resumes border-wall construction; raises the asylum bar; expands detention and expedited removal

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `immigration-q2` | "Should the U.S. increase border security funding?" | +8 (right) | Direct match. Resuming border-wall construction + expanding detention is quintessential border security spending and policy. No keyword rule in question-bill-keywords.ts covers this exact bill title, but the substantive alignment is unambiguous | HIGH — this is the landmark border security bill of the 118th Congress. The question asks precisely what the bill funds. |
| `immigration-q6` | "Should the U.S. increase protections for asylum seekers?" | +8 (right) | The bill raises the asylum bar (makes it harder to receive asylum). A Yea → right on this axis (less asylum protection). The question asks whether protections should increase, so Yea = "No" → right-of-center | HIGH |

> **Proposed mapping: immigration-q2 at +8 (HIGH), immigration-q6 at +8 (HIGH). Two-question map is justified — this bill directly addresses both border security spending and asylum policy.**

---

### HR30 (119) — Preventing Violence Against Women by Illegal Aliens Act
**Lean:** right (+) | **A Yea does:** Makes noncitizens with sex-offense, domestic-violence, or stalking convictions inadmissible and deportable

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `immigration-q7` | "Should immigration enforcement prioritize serious criminal cases?" | +8 (right) | This bill targets noncitizens with sex-offense and DV convictions specifically — exactly the "serious criminal cases" the question references. A Yea expands deportation grounds for such cases, which is right-coded enforcement | HIGH |
| `immigration-q2` | "Should the U.S. increase border security funding?" | +8 (right) | Border security is related but this bill is about inadmissibility/deportation grounds, not funding | LOW — do not map; mechanism mismatch. |

> **Proposed mapping: immigration-q7 at +8. HIGH confidence.**

---

### HR2056 (119) — DC Federal Immigration Compliance Act
**Lean:** right (+) | **A Yea does:** Bars DC sanctuary policies that limit cooperation with federal immigration enforcement

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `immigration-q7` | "Should immigration enforcement prioritize serious criminal cases?" | +8 (right) | Requiring cooperation with federal enforcement is right-coded on immigration enforcement. However, this question is specifically about enforcement priorities (serious vs. all), while this bill is about sanctuary policy regardless of case type | MEDIUM — directional alignment is correct (right, enforcement expansion) but the question's "prioritize serious criminal cases" framing doesn't match the bill's all-cases sanctuary elimination. **Flag.** |
| `immigration-q2` | "Should the U.S. increase border security funding?" | +8 (right) | Sanctuary elimination is about enforcement cooperation, not border security funding | LOW — do not map. |

> **Proposed mapping: immigration-q7 at +8, MEDIUM confidence. The sanctuary-vs.-prioritization distinction should be flagged in provenance. Alternatively, consider 0 mappings if the enforcement-priority framing is too specific.**

---

### HR2913 (119) — Ukraine Support Act
**Lean:** left (−) | **A Yea does:** Continues U.S. support for Ukraine

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `defense-q6` | "Should military aid to foreign allies be expanded?" | −8 (left) | Direct substantive match. Continuing Ukraine support is military aid to a foreign partner; a Yea supports expanded military assistance. The question directly asks about military aid to allies | HIGH |
| `defense-q15` | "Should the U.S. increase foreign aid spending?" | −8 (left) | Ukraine support also involves foreign aid broadly — Yea = expand foreign aid | HIGH — second legitimate mapping; the bill covers both military and general assistance to Ukraine |

> **Proposed mapping: defense-q6 at −8 (HIGH), defense-q15 at −8 (HIGH). Two-question map is justified — Ukraine support answers both the military-aid and foreign-aid questions directly.**

---

## Section 6: Rights & Justice (3 key votes)

---

### HR26 (118) — Born-Alive Abortion Survivors Protection Act
**Lean:** right (+) | **A Yea does:** Requires medical care for any infant born alive after an attempted abortion; imposes criminal penalties on providers who fail to provide it

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `civil-rights-q22` | "Should federal law protect the right to abortion nationwide?" | +8 (right) | Direct substantive match. The `civil-rights-q22` keyword rule explicitly includes "born-alive" at axis=+1. This is the canonical right-coded abortion policy vote | HIGH |

> **Proposed mapping: civil-rights-q22 at +8. HIGH confidence.**

---

### HR28 (119) — Protection of Women and Girls in Sports Act
**Lean:** right (+) | **A Yea does:** Defines "sex" under Title IX as determined at birth; bars athletes assigned male at birth from female-designated school sports

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `civil-rights-q9` | "Should protections for LGBTQ+ individuals be codified in federal law?" | +8 (right) | The `civil-rights-q9` keyword rule explicitly includes "protection of women and girls in sports" at axis=+1. This is a direct keyword match AND the canonical LGBTQ+/sports question anchor | HIGH — literal keyword match in the rule; the bill directly maps to this specific quiz question. |

> **Proposed mapping: civil-rights-q9 at +8. HIGH confidence.**

---

### HR1041 (119) — Veterans 2nd Amendment Protection Act
**Lean:** right (+) | **A Yea does:** Requires a judicial danger finding before the VA reports a beneficiary to the firearms background-check system

| question_id | Question text | Derived answer_value (Yea) | Rationale | Confidence |
|---|---|---|---|---|
| `civil-rights-q21` | "Should Congress require universal background checks for all gun sales?" | +8 (right) | The bill restricts the VA's ability to refer veterans to the background-check system without judicial review — it limits background-check triggers. A Yea opposes expanding background-check reporting, which is right-coded on this axis. The `civil-rights-q21` keyword rule uses "background check" at axis=−1 for expansion; a Yea here runs opposite | HIGH — the bill directly touches the background-check system. The direction (limit automatic VA referrals) is right-of-center relative to the question's framing. |

> **Proposed mapping: civil-rights-q21 at +8. HIGH confidence.**

---

## Coverage Summary

| Metric | Count |
|---|---|
| Total key votes | 28 |
| Votes with ≥1 HIGH-confidence mapping | 13 |
| Votes with MEDIUM-confidence mapping (owner review needed) | 8 |
| Votes with 0 proposed mappings (no clean question match) | 7 |
| Unique quiz questions that would receive a vote-derived answer | ~18 |

**Questions that get a HIGH-confidence vote-derived answer:**

| question_id | Question (abbreviated) | Via which key vote(s) |
|---|---|---|
| `economy-q15` | Fed minimum wage | HR2312 |
| `economy-q16` | Easier to unionize | HR2550, HR5408 |
| `environment-q16` | Restrict mineral extraction on public lands | HR1366 |
| `environment-q7` | Expand renewable energy subsidies | HR4758 |
| `government-q18` | Reduce red tape targets | HR2965 |
| `jud-06` | Court deference to executive agencies | HR288 |
| `civil-rights-q9` | Codify LGBTQ+ protections | HR498, HR28 |
| `civil-rights-q21` | Universal background checks | HR1041 |
| `civil-rights-q22` | Federal abortion protection | HR26 |
| `immigration-q2` | Increase border security funding | HR2 |
| `immigration-q6` | Increase asylum seeker protections | HR2 |
| `immigration-q7` | Enforce against serious criminal cases | HR30 |
| `defense-q6` | Military aid to foreign allies | HR2913 |
| `defense-q15` | Increase foreign aid spending | HR2913 |

**Votes proposed as 0-question-mapped (confirm with owner):**

| Key vote | Reason |
|---|---|
| HR1163 (UI fraud) | No quiz question matches UI fraud-recovery statute of limitations |
| HR4468 (auto emissions) | Vehicle vs. power-plant emissions distinction; no clean match |
| HR1346 (E15 fuel) | Fuel-blend agriculture policy; no clean question |
| HR485 (QALY prohibition) | Coverage-methodology technicality; no quiz question addresses it |
| HR5125 (DC judicial nominations) | DC appointment process; no quiz question matches |
| HJRES72 (terminate emergency) | Congressional emergency-powers check; no high-fit question |
| HR497 (vaccine mandate repeal) | Provider mandate repeal; too narrow for public-health-infrastructure question |

---

## Open Questions for Owner Approval

### 1. Magnitude / answer_value scale
This draft uses **±8** as the default for party-line key votes ("strong directional evidence, not maximum"). Alternatives:
- **±10** for party-line final-passage votes (the starkest possible signal).
- **±7** for bills with any cross-party support (e.g. HR1346, HR2270).
- A standard table (party-line = ±8, mixed = ±5, near-unanimous = ±3).
**Owner must pick a scale before any values are written to the DB.**

### 2. Non-keyword-title matches
Some mappings (HR2312 → economy-q15, HR2 → immigration-q2/q6) have strong substantive alignment but no literal keyword hit in `question-bill-keywords.ts`. The question-bill-keywords rules govern citation enrichment (Tier 2), not this vote-map. **Confirm: for vote-derived answer_values, substantive alignment confirmed by human review is sufficient, not requiring a keyword rule hit.** (The `README.md` is explicit that vote-derived answers go through human review — this document is that review.)

### 3. Cross-topic question mapping
HR2965 (Small Business Regulatory Reduction Act, filed under economy-work) maps to `government-q18`, not an economy question. This is correct — the vote answers what it answers. **Confirm this is acceptable: a vote in the economy rubric topic can derive an answer for a government-topic question.**

### 4. DC-scoped votes
HR884 (noncitizen voting ban) and HR2056 (DC sanctuary ban) and HR5125 (DC judicial nominations) apply specifically to DC, not nationwide. If mapped, candidate answers derived from these votes should carry a provenance note: "based on DC-specific legislation; may not reflect nationwide position." **Confirm: are DC-specific bills acceptable vote-map sources, or should they be excluded from answer derivation?**

### 5. Multi-question bills (HR2, HR2913)
HR2 maps to both immigration-q2 and immigration-q6; HR2913 maps to both defense-q6 and defense-q15. For these, should the same vote derive two `candidate_answers` rows (one per question), or should the owner pick the single most direct question? The methodology doesn't prohibit two rows, but the sign-consistency guard in Tier 2 citations only attaches one citation per (question, member) pair.

### 6. `Not Voting` / `Present` handling
The poliscore methodology excludes Not Voting from the score average and surfaces it as a separate metric. For `candidate_answers` derivation: if a member is `Not Voting` on a key vote, **no answer_value should be derived** (same as the PoliScore exclusion rule). `Present` is ambiguous — treat as Not Voting (no derivation) unless owner decides otherwise.

### 7. `jud-06` topic status
The question `jud-06` is in the "judicial" topic (from an older migration). Confirm this topic is still active in the live questions table and that alignment-quiz scoring covers it, before implementing a vote-derived answer for HR288.

### 8. healthcare-q15 and HR497 (vaccine mandate)
The proposed MEDIUM-confidence mapping of HR497 to healthcare-q15 ("increase investment in public health infrastructure") is a possible anti-direction map: repealing a mandate ≠ reducing infrastructure investment. **Owner should likely approve 0 mappings here.**

### 9. HJRES72 → government-q19
A joint resolution disapproving a presidential emergency declaration is about executive-power checks, not "oversight of executive agencies" (which typically means oversight of Cabinet departments/agencies via appropriations and hearings). The connection is thematic but imprecise. **Owner should approve or reject this mapping.**

---

*Produced 2026-06-17. For review by owner + `alignment-quiz-reviewer` before any downstream implementation.*
