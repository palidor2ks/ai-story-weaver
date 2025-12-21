-- Continue adding answer options for remaining questions

-- eco3 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('eco3-1', 'eco3', 'Protective tariffs when in national interest.', 10, 1),
('eco3-2', 'eco3', 'Pro‑trade; reduce tariffs and barriers to growth.', 5, 2),
('eco3-3', 'eco3', 'Pro‑trade; update deals for supply chains and national security.', 0, 3),
('eco3-4', 'eco3', 'Pro‑trade with strong labor/environment standards and enforcement.', -5, 4),
('eco3-5', 'eco3', 'Skeptical—labor/enviro standards and fair trade, not corporate deals.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- eco4 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('eco4-1', 'eco4', 'Limit union power and federal intervention.', 10, 1),
('eco4-2', 'eco4', 'Respect unions; oppose coercive practices; protect right‑to‑work.', 5, 2),
('eco4-3', 'eco4', 'Support worker representation/portable benefits; prevent coercion on both sides.', 0, 3),
('eco4-4', 'eco4', 'Support unions and worker power; protect organizing rights.', -5, 4),
('eco4-5', 'eco4', 'Strongly support; expand organizing and bargaining rights.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- eco5 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('eco5-1', 'eco5', 'Oppose UBI; cut federal welfare programs.', 10, 1),
('eco5-2', 'eco5', 'Skeptical—prefer work incentives and targeted aid.', 5, 2),
('eco5-3', 'eco5', 'Pilot UBI/earnings credits; evaluate outcomes rigorously.', 0, 3),
('eco5-4', 'eco5', 'Open to pilots/negative income tax; ensure fiscal sustainability.', -5, 4),
('eco5-5', 'eco5', 'Yes—UBI or guaranteed income to reduce poverty.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- eco10 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('eco10-1', 'eco10', 'Oppose federal restructuring; market discipline should prevail.', 10, 1),
('eco10-2', 'eco10', 'No breakups unless clear harm; reduce red tape, improve supervision.', 5, 2),
('eco10-3', 'eco10', 'Use rigorous stress tests/resolution; break up only if proven necessary.', 0, 3),
('eco10-4', 'eco10', 'Consider structural remedies; enforce tough capital and resolution rules.', -5, 4),
('eco10-5', 'eco10', 'Yes—break up systemically risky banks and restore strict separations.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- eco15 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('eco15-1', 'eco15', 'Yes—abolish the estate tax entirely.', 10, 1),
('eco15-2', 'eco15', 'Raise exemptions and reduce rates; limit scope to avoid burdening family enterprises.', 5, 2),
('eco15-3', 'eco15', 'Maintain current framework; calibrate exemption and rates based on revenue and equity goals.', 0, 3),
('eco15-4', 'eco15', 'Keep estate tax with high exemption; tighten avoidance while protecting genuine small businesses/farms.', -5, 4),
('eco15-5', 'eco15', 'No—strengthen the estate tax, lower exemption for ultra‑wealthy, close valuation loopholes.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- eco16 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('eco16-1', 'eco16', 'Yes—strong penalties and strict ethics for Congress.', 10, 1),
('eco16-2', 'eco16', 'Yes—enforce insider‑trading laws and ethics rules.', 5, 2),
('eco16-3', 'eco16', 'Yes—strict rules, audits, and penalties.', 0, 3),
('eco16-4', 'eco16', 'Yes—ban trading on nonpublic info; require blind trusts/disclosure.', -5, 4),
('eco16-5', 'eco16', 'Yes—ban and enforce strongly with transparency.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- eco17 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('eco17-1', 'eco17', 'Lower substantially and reduce regulation.', 10, 1),
('eco17-2', 'eco17', 'Lower/keep low to boost jobs/investment.', 5, 2),
('eco17-3', 'eco17', 'Keep competitive rate; broaden base and simplify.', 0, 3),
('eco17-4', 'eco17', 'Raise somewhat on multinationals and close loopholes/minimums.', -5, 4),
('eco17-5', 'eco17', 'Raise rates on large profitable corporations.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- eco20 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('eco20-1', 'eco20', 'Oppose federal reclassification mandates; let states/markets set terms.', 10, 1),
('eco20-2', 'eco20', 'Retain contractor status for most drivers to preserve flexibility; encourage voluntary/portable benefits via tax credits.', 5, 2),
('eco20-3', 'eco20', 'Adopt a balanced test (economic realities) and enable portable benefits regardless of status.', 0, 3),
('eco20-4', 'eco20', 'Presume employee status for core-platform workers; allow limited contractor roles; consider portable benefits.', -5, 4),
('eco20-5', 'eco20', 'Classify most gig workers as employees with full labor protections (minimum wage, overtime, collective bargaining).', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- eco26 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('eco26-1', 'eco26', 'Expand RTW nationwide and limit public‑sector union power.', 10, 1),
('eco26-2', 'eco26', 'Support RTW to protect worker freedom not to join/pay unions; encourage union transparency.', 5, 2),
('eco26-3', 'eco26', 'Neutral/conditional; protect worker choice while ensuring unions can bargain effectively.', 0, 3),
('eco26-4', 'eco26', 'Oppose RTW and support fair‑share fees with safeguards; strengthen collective bargaining.', -5, 4),
('eco26-5', 'eco26', 'Oppose right‑to‑work; support stronger union rights and card‑check recognition.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- eco27 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('eco27-1', 'eco27', 'Minimal federal interference in corporate structure.', 10, 1),
('eco27-2', 'eco27', 'Address abuses via enforcement; avoid structural breakups.', 5, 2),
('eco27-3', 'eco27', 'Enforce competition laws; intervene structurally only if necessary.', 0, 3),
('eco27-4', 'eco27', 'Stronger antitrust in agriculture; fair markets for farmers.', -5, 4),
('eco27-5', 'eco27', 'Yes—break up concentration and support small farms.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- eco28 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('eco28-1', 'eco28', 'Significantly reduce or restructure CFPB.', 10, 1),
('eco28-2', 'eco28', 'Reduce regulatory burdens; ensure accountability and judicial checks.', 5, 2),
('eco28-3', 'eco28', 'Clarify mandate and accountability; measure outcomes.', 0, 3),
('eco28-4', 'eco28', 'Strengthen CFPB enforcement and rulemaking.', -5, 4),
('eco28-5', 'eco28', 'Expand powers and enforcement to protect consumers.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- eco30 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('eco30-1', 'eco30', 'Oppose new federal excise taxes.', 10, 1),
('eco30-2', 'eco30', 'Skeptical of sin taxes; prefer education and choice.', 5, 2),
('eco30-3', 'eco30', 'Consider if evidence shows benefits; avoid regressivity.', 0, 3),
('eco30-4', 'eco30', 'Open to targeted health taxes with equity safeguards.', -5, 4),
('eco30-5', 'eco30', 'Support excise taxes to reduce harm and fund care.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- eco35 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('eco35-1', 'eco35', 'Aggressive sanctions where U.S. interests demand.', 10, 1),
('eco35-2', 'eco35', 'Support targeted sanctions tied to clear goals.', 5, 2),
('eco35-3', 'eco35', 'Use targeted, coalition sanctions with clear goals and off‑ramps.', 0, 3),
('eco35-4', 'eco35', 'Use targeted sanctions with allied coordination and clear goals.', -5, 4),
('eco35-5', 'eco35', 'Prefer diplomacy and development; avoid broad sanctions.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- eco38 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('eco38-1', 'eco38', 'Strongly support RTW and limit union power.', 10, 1),
('eco38-2', 'eco38', 'Support right‑to‑work; protect worker choice.', 5, 2),
('eco38-3', 'eco38', 'Promote worker choice and fair representation; prevent coercion.', 0, 3),
('eco38-4', 'eco38', 'Oppose; strengthen union rights and wages.', -5, 4),
('eco38-5', 'eco38', 'Oppose; support strong unions and collective bargaining.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- eco40 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('eco40-1', 'eco40', 'Oppose federal food/drink taxes.', 10, 1),
('eco40-2', 'eco40', 'Skeptical—avoid new federal sin taxes; encourage personal responsibility.', 5, 2),
('eco40-3', 'eco40', 'Prefer education/labeling; consider local pilots before federal taxes.', 0, 3),
('eco40-4', 'eco40', 'Open to targeted health taxes if revenues fund care and nutrition.', -5, 4),
('eco40-5', 'eco40', 'Support public‑health excise taxes with equity safeguards.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- eco42 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('eco42-1', 'eco42', 'Contractor status; minimal federal mandates.', 10, 1),
('eco42-2', 'eco42', 'Keep contractors with clear tests; encourage voluntary benefits.', 5, 2),
('eco42-3', 'eco42', 'Hybrid/portable‑benefits model with clear tests.', 0, 3),
('eco42-4', 'eco42', 'Employee presumption with portable benefits/flexibility options.', -5, 4),
('eco42-5', 'eco42', 'Employees with full protections by default; curb misclassification.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- eco48 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('eco48-1', 'eco48', 'Abolish the estate tax entirely.', 10, 1),
('eco48-2', 'eco48', 'Yes—reduce or abolish the estate tax.', 5, 2),
('eco48-3', 'eco48', 'Keep but adjust thresholds and simplify.', 0, 3),
('eco48-4', 'eco48', 'No—maintain estate tax for very large estates; close loopholes.', -5, 4),
('eco48-5', 'eco48', 'No—keep/raise estate taxes to reduce inequality.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- edu12 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('edu12-1', 'edu12', 'Yes—end tenure; empower administrators and parents.', 10, 1),
('edu12-2', 'edu12', 'Yes—limit or replace tenure with contracts/merit systems.', 5, 2),
('edu12-3', 'edu12', 'Streamline due‑process timelines; link to development and outcomes.', 0, 3),
('edu12-4', 'edu12', 'Reform tenure for effectiveness but keep due process.', -5, 4),
('edu12-5', 'edu12', 'No—protect tenure/due process; improve supports.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- gov1 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('gov1-1', 'gov1', 'Oppose term limits for justices.', 10, 1),
('gov1-2', 'gov1', 'No—life tenure preserves independence.', 5, 2),
('gov1-3', 'gov1', 'Yes—bipartisan plan for 18‑year terms should be considered.', 0, 3),
('gov1-4', 'gov1', 'Open to term limits and ethics reforms.', -5, 4),
('gov1-5', 'gov1', 'Yes—establish staggered terms to depoliticize appointments.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- gov2 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('gov2-1', 'gov2', 'Strongly oppose altering the Court''s size.', 10, 1),
('gov2-2', 'gov2', 'No—oppose changing Court size.', 5, 2),
('gov2-3', 'gov2', 'Create bipartisan commission to evaluate options before changes.', 0, 3),
('gov2-4', 'gov2', 'Open to reforms (ethics/term limits); cautious about size changes.', -5, 4),
('gov2-5', 'gov2', 'Yes—consider expansion or term limits to rebalance.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- gov4 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('gov4-1', 'gov4', 'No federal role—states draw districts under constitutional rules.', 10, 1),
('gov4-2', 'gov4', 'Prefer state‑level reforms; oppose federal mandates.', 5, 2),
('gov4-3', 'gov4', 'Yes—national baseline for fair maps and independent commissions.', 0, 3),
('gov4-4', 'gov4', 'Yes—federal standards and independent commissions.', -5, 4),
('gov4-5', 'gov4', 'Yes—independent redistricting nationwide.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- gov8 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('gov8-1', 'gov8', 'Reduce congressional compensation and eliminate perks.', 10, 1),
('gov8-2', 'gov8', 'Hold pay flat; cut perks; focus on fiscal responsibility.', 5, 2),
('gov8-3', 'gov8', 'Independent commission with performance/ethics benchmarks; avoid grandstanding cuts.', 0, 3),
('gov8-4', 'gov8', 'Create an independent commission for fair, transparent pay and ethics rules.', -5, 4),
('gov8-5', 'gov8', 'Tie pay to median worker wages and ban outside lobbying income.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- gov10 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('gov10-1', 'gov10', 'Oppose national plebiscites; states can use initiatives.', 10, 1),
('gov10-2', 'gov10', 'No national referendums; preserve representative government and federalism.', 5, 2),
('gov10-3', 'gov10', 'Pilot deliberative citizen initiatives with guardrails.', 0, 3),
('gov10-4', 'gov10', 'Consider carefully; protect minority rights and the Constitution.', -5, 4),
('gov10-5', 'gov10', 'Yes—expand direct democracy at national and local levels.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- gov14 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('gov14-1', 'gov14', 'Strongly oppose lowering amendment thresholds.', 10, 1),
('gov14-2', 'gov14', 'No—keep high bar for amendments.', 5, 2),
('gov14-3', 'gov14', 'Keep Article V thresholds; use state‑led compacts and reforms.', 0, 3),
('gov14-4', 'gov14', 'Cautious—protect stability while pursuing reforms via legislation and states.', -5, 4),
('gov14-5', 'gov14', 'Yes—enable democratic reforms like PR and voting rights.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- gov15 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('gov15-1', 'gov15', 'Oppose federal gun control entirely.', 10, 1),
('gov15-2', 'gov15', 'No—Second Amendment rights and state laws should prevail.', 5, 2),
('gov15-3', 'gov15', 'Set minimum standards; allow states to tailor additional rules.', 0, 3),
('gov15-4', 'gov15', 'Yes—baseline national rules like background checks.', -5, 4),
('gov15-5', 'gov15', 'Yes—strong national standards on guns.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- erm3 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('erm3-1', 'erm3', 'Strongly oppose abolishing the Electoral College.', 10, 1),
('erm3-2', 'erm3', 'No—keep the Electoral College as part of the Constitution.', 5, 2),
('erm3-3', 'erm3', 'Keep EC for now; focus on broader election reforms like RCV and open primaries.', 0, 3),
('erm3-4', 'erm3', 'Open to reforms that ensure every vote counts; back pro‑voter democracy changes.', -5, 4),
('erm3-5', 'erm3', 'Yes—move to a national popular vote.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- erm5 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('erm5-1', 'erm5', 'Oppose AVR; voters should opt in.', 10, 1),
('erm5-2', 'erm5', 'No federal mandate; states decide registration rules.', 5, 2),
('erm5-3', 'erm5', 'Yes where states choose; integrate with secure DMV systems.', 0, 3),
('erm5-4', 'erm5', 'Yes—AVR and other pro‑voter reforms.', -5, 4),
('erm5-5', 'erm5', 'Yes—automatic registration and same‑day voting.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- erm6 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('erm6-1', 'erm6', 'Yes—strict term limits to restore citizen legislature.', 10, 1),
('erm6-2', 'erm6', 'Yes—term limits for Congress.', 5, 2),
('erm6-3', 'erm6', 'Yes—term limits to reduce entrenchment.', 0, 3),
('erm6-4', 'erm6', 'Open to term limits alongside other democracy reforms.', -5, 4),
('erm6-5', 'erm6', 'Yes—term limits plus stronger ethics rules.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- erm9 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('erm9-1', 'erm9', 'Limit mail voting to narrow, verified circumstances.', 10, 1),
('erm9-2', 'erm9', 'Oppose national mandate; encourage in‑person voting with absentee for limited reasons.', 5, 2),
('erm9-3', 'erm9', 'Yes with tracking, audits, and signature cure processes.', 0, 3),
('erm9-4', 'erm9', 'Yes—expand early/mail voting with safeguards.', -5, 4),
('erm9-5', 'erm9', 'Yes—no‑excuse mail voting nationwide.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- social9 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('social9-1', 'social9', 'Oppose adding new protected categories federally.', 10, 1),
('social9-2', 'social9', 'Skeptical—protect free speech/religious rights; prefer state solutions.', 5, 2),
('social9-3', 'social9', 'Yes—with religious liberty accommodations and clear guidance.', 0, 3),
('social9-4', 'social9', 'Yes—strengthen federal civil rights protections.', -5, 4),
('social9-5', 'social9', 'Yes—explicitly protect gender identity/expression nationwide.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- social10 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('social10-1', 'social10', 'Do not fund Planned Parenthood with federal dollars.', 10, 1),
('social10-2', 'social10', 'Restrict or redirect funds to other providers; ensure no federal abortion funding.', 5, 2),
('social10-3', 'social10', 'Fund evidence‑based care with strict compliance and transparency.', 0, 3),
('social10-4', 'social10', 'Yes—support non‑abortion health services, protect access.', -5, 4),
('social10-5', 'social10', 'Yes—fund reproductive health services including comprehensive care.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- social12 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('social12-1', 'social12', 'Oppose open service policies.', 10, 1),
('social12-2', 'social12', 'Cautious—policies should prioritize readiness and costs; defer to commanders.', 5, 2),
('social12-3', 'social12', 'Yes—focus on readiness and equal treatment; clear medical standards.', 0, 3),
('social12-4', 'social12', 'Yes—serve openly under equal standards.', -5, 4),
('social12-5', 'social12', 'Yes—full inclusion and medical care coverage.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- social17 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('social17-1', 'social17', 'Oppose new federal rights amendments.', 10, 1),
('social17-2', 'social17', 'Skeptical of new amendments; rely on statutes and courts.', 5, 2),
('social17-3', 'social17', 'Consider a narrow amendment; also pass strong privacy laws.', 0, 3),
('social17-4', 'social17', 'Yes—strengthen privacy protections in law/Constitution.', -5, 4),
('social17-5', 'social17', 'Yes—amend Constitution to protect privacy/civil liberties.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- social18 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('social18-1', 'social18', 'Ban most abortions nationwide; protect life from conception.', 10, 1),
('social18-2', 'social18', 'Restrict with exceptions (life, rape, incest); return decisions to states.', 5, 2),
('social18-3', 'social18', 'Protect early‑term access; seek consensus limits late‑term with exceptions.', 0, 3),
('social18-4', 'social18', 'Protect access nationally with limits late in pregnancy and health safeguards.', -5, 4),
('social18-5', 'social18', 'Protect legal abortion nationwide; remove barriers; support care.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- social20 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('social20-1', 'social20', 'Oppose; protect life from conception to natural death.', 10, 1),
('social20-2', 'social20', 'Skeptical or oppose; prioritize palliative care.', 5, 2),
('social20-3', 'social20', 'States decide; ensure strong consent and oversight.', 0, 3),
('social20-4', 'social20', 'Allow with strict safeguards and counseling.', -5, 4),
('social20-5', 'social20', 'Support legal, regulated physician‑assisted dying with safeguards.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- social22 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('social22-1', 'social22', 'No federal regulation of online speech.', 10, 1),
('social22-2', 'social22', 'Oppose government involvement in speech; protect free expression.', 5, 2),
('social22-3', 'social22', 'Focus on transparency, provenance labels, and independent audits.', 0, 3),
('social22-4', 'social22', 'No direct content policing; require transparency, ads rules, and research access.', -5, 4),
('social22-5', 'social22', 'Limited role—transparency and media literacy; no censorship.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- social23 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('social23-1', 'social23', 'Oppose funding embryonic research.', 10, 1),
('social23-2', 'social23', 'Cautious or oppose embryonic research; support alternatives.', 5, 2),
('social23-3', 'social23', 'Yes for therapies with strict ethics; transparency.', 0, 3),
('social23-4', 'social23', 'Yes—support biomedical research with guardrails.', -5, 4),
('social23-5', 'social23', 'Yes—fund research with ethical oversight.', -10, 5)
ON CONFLICT (id) DO NOTHING;