-- First, delete existing quiz_answers that reference questions being replaced
DELETE FROM quiz_answers;

-- Delete existing question_options
DELETE FROM question_options;

-- Delete existing questions  
DELETE FROM questions;

-- Map category names to topic IDs
-- Categories: Criminal Justice, Technology, Healthcare, Environment, Economy, Government Reform, Electoral Reform, Education, Social Issues, Domestic Policy, Immigration, Foreign Policy, Civil Rights, China/Taiwan Conflict, Israel/Palestine

-- Insert questions (unique by question ID)
INSERT INTO questions (id, topic_id, text) VALUES
-- Criminal Justice
('cj15', 'criminal-justice', 'Do you support "red flag" laws, which allow temporary removal of firearms from individuals deemed a danger to themselves or others?'),
('cj12', 'criminal-justice', 'Should solitary confinement be banned in U.S. prisons?'),
('cj10', 'criminal-justice', 'Should there be a national database for police misconduct records?'),

-- Technology
('tech2', 'technology', 'Do you support "right to repair" laws for consumer electronics and farm equipment?'),
('tech11', 'technology', 'Should Section 230 be reformed so social media companies are more liable for user content?'),
('tech15', 'technology', 'Should Section 230 protections be reformed so platforms are more liable for user content?'),
('tech21', 'technology', 'Should social media companies be legally required to be politically neutral, or can they moderate content as they see fit?'),
('tech16', 'technology', 'Should social media companies be legally required to be politically neutral?'),
('tech26', 'technology', 'Should the government regulate AI in critical areas (criminal justice, hiring) to prevent bias?'),
('tech1', 'technology', 'Should the government regulate large technology companies to prevent monopolies?'),
('tech27', 'technology', 'Should the government regulate or break up large technology companies to prevent monopolies?'),
('tech18', 'technology', 'Should the government regulate the use of AI in critical areas like criminal justice and hiring to prevent bias?'),
('tech31', 'technology', 'Should there be a federal data privacy law protecting strong encryption even if it hinders law‑enforcement access?'),
('tech32', 'technology', 'Should there be a federal data privacy law similar to Europe''s GDPR?'),
('tech33', 'technology', 'Should there be a federal data privacy law, similar to Europe''s GDPR?'),

-- Healthcare
('health8', 'healthcare', 'Do you support a "public option" for health insurance?'),
('health14', 'healthcare', 'Should the government regulate the prices of hospital services and medical procedures?'),

-- Environment  
('env16', 'environment', 'Do you support a ban on the use of neonicotinoid pesticides to protect bee populations?'),
('env7', 'environment', 'Do you support a federal ban on single-use plastics (e.g., bags, straws, bottles)?'),

-- Economy
('eco18', 'economy', 'Do you support a federal paid family and medical leave program?'),
('eco6', 'economy', 'Do you support a wealth tax on the assets of the super-rich?'),
('eco13', 'economy', 'Do you support raising taxes on capital gains?'),
('eco33', 'economy', 'Should student loan debt be dischargeable in bankruptcy?'),
('eco47', 'economy', 'Should the government provide subsidies for industries vital for national security (e.g., semiconductors)?'),
('eco14', 'economy', 'Should the government provide subsidies to farmers?'),
('eco1', 'economy', 'Should the government raise the federal minimum wage?'),
('eco11', 'economy', 'Should the government regulate the stock market more heavily?'),
('eco19', 'economy', 'Should the government subsidize childcare for all families?'),
('eco22', 'economy', 'Should there be a financial transaction tax on stock trades?'),
('eco7', 'economy', 'Should the U.S. use tariffs to protect domestic industries from foreign competition?'),

-- Government Reform
('gov6', 'government-reform', 'Do you support maintaining the U.S. Space Force as a separate military branch?'),
('gov11', 'government-reform', 'Should states have more power relative to the federal government?'),

-- Electoral Reform
('erm1', 'electoral-reform', 'Do you support making Washington, D.C., a state?'),
('erm11', 'electoral-reform', 'Do you support ranked-choice voting for federal elections?'),
('erm10', 'electoral-reform', 'Should there be a cap on the age at which a person can run for president?'),

-- Education
('edu4', 'education', 'Do you support public funding for charter schools?'),
('edu6', 'education', 'Should sex education in public schools be mandatory?'),
('edu8', 'education', 'Should teachers and staff in public schools be allowed to carry guns?'),
('edu10', 'education', 'Should teachers'' pay be based on student performance and standardized test scores?'),
('edu2', 'education', 'Should the government support school voucher programs?'),
('edu5', 'education', 'What should be the government''s approach to student loan debt?'),

-- Social Issues
('social6', 'social-issues', 'Should religious institutions remain tax‑exempt?'),
('social7', 'social-issues', 'Should same‑sex marriage be legally recognized nationwide?'),
('social11', 'social-issues', 'Should there be a federal law protecting the right to access gender‑affirming care?'),
('social16', 'social-issues', 'Should there be a mandatory buyback program for certain firearms (e.g., "assault weapons")?'),

-- Domestic Policy
('dp3', 'domestic-policy', 'Should the government require background checks for all gun sales, including at gun shows and private sales?'),

-- Immigration
('imm1', 'immigration', 'Should the U.S. build a wall along the southern border?'),
('imm2', 'immigration', 'Should undocumented immigrants have a path to citizenship?'),

-- Foreign Policy
('fp17', 'foreign-policy', 'Should the U.S. use economic sanctions as a primary tool of foreign policy?'),
('fp13', 'foreign-policy', 'Should the U.S. withdraw its troops from South Korea?'),
('fp16', 'foreign-policy', 'What should be the primary goal of U.S. foreign policy?'),
('fp8', 'foreign-policy', 'What should be the U.S. policy toward Russia?'),

-- China/Taiwan Conflict
('ct5', 'china-taiwan', 'Should the U.S. support Taiwan''s bid for membership in organizations like the WHO and other UN bodies?'),
('ct2', 'china-taiwan', 'What should be the U.S. approach to economic relations with China given tensions over Taiwan?'),

-- Israel/Palestine
('ip3', 'israel-palestine', 'Should the U.S. unilaterally recognize a Palestinian state?'),
('ip6', 'israel-palestine', 'Should the U.S. publicly call for an immediate, permanent cease-fire?'),
('ip7', 'israel-palestine', 'Should a U.S. cease-fire call be conditioned on a verified hostage release?'),
('ip8', 'israel-palestine', 'Should the U.S. support a time-limited humanitarian pause instead of a full cease-fire?'),
('ip9', 'israel-palestine', 'Should the U.S. encourage third-party mediation (e.g., Egypt/Qatar) for a comprehensive hostages‑for‑prisoners exchange?'),
('ip10', 'israel-palestine', 'Should the U.S. support an international stabilization/peacekeeping mission in Gaza after major hostilities end?'),
('ip11', 'israel-palestine', 'Should the U.S. restore/expand funding for UNRWA with added audit/oversight requirements?');

-- Now insert question options
-- Each question gets 5 options (excluding Libertarian which has NA score)
-- Score mapping: Far left = -10, Center left = -5, Center = 0, Center right = 5, Far right = 10

-- cj15 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('cj15-far-left', 'cj15', 'Yes—with strong protections and broad coverage.', -10, 1),
('cj15-center-left', 'cj15', 'Yes—due process plus rapid court review.', -5, 2),
('cj15-center', 'cj15', 'Support state laws with robust due‑process standards.', 0, 3),
('cj15-center-right', 'cj15', 'Skeptical—support only with strict due process and limited scope.', 5, 4),
('cj15-far-right', 'cj15', 'Oppose red‑flag laws as unconstitutional.', 10, 5);

-- tech2 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('tech2-far-left', 'tech2', 'Yes—require access to parts, tools, and manuals.', -10, 1),
('tech2-center-left', 'tech2', 'Yes—federal standard for repair access and competition.', -5, 2),
('tech2-center', 'tech2', 'Yes—reasonable access with safety/IP safeguards.', 0, 3),
('tech2-center-right', 'tech2', 'Cautious—support competition, avoid over‑regulation.', 5, 4),
('tech2-far-right', 'tech2', 'Prefer state/market solutions over federal mandates.', 10, 5);

-- health8 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('health8-far-left', 'health8', 'Yes—step toward universal public coverage.', -10, 1),
('health8-center-left', 'health8', 'Yes—create a public option to compete and expand coverage.', -5, 2),
('health8-center', 'health8', 'Yes—offer a voluntary public plan with risk adjustment and fiscal guardrails.', 0, 3),
('health8-center-right', 'health8', 'Oppose public option; risk crowding out private plans.', 5, 4),
('health8-far-right', 'health8', 'Oppose; reduce federal role in insurance.', 10, 5);

-- env16 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('env16-far-left', 'env16', 'Yes—ban neonics and adopt safer practices.', -10, 1),
('env16-center-left', 'env16', 'Tighten or ban high‑risk uses based on science.', -5, 2),
('env16-center', 'env16', 'Phase down risky uses; fast‑track safer alternatives.', 0, 3),
('env16-center-right', 'env16', 'Cautious—rely on risk assessments; avoid blanket bans.', 5, 4),
('env16-far-right', 'env16', 'Oppose federal bans; state/market decision.', 10, 5);

-- env7 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('env7-far-left', 'env7', 'Yes—phase out single‑use plastics and expand reuse.', -10, 1),
('env7-center-left', 'env7', 'Support national reduction standards and producer responsibility.', -5, 2),
('env7-center', 'env7', 'Set reduction targets; allow state innovation and industry alternatives.', 0, 3),
('env7-center-right', 'env7', 'Skeptical of federal bans; encourage recycling and innovation instead.', 5, 4),
('env7-far-right', 'env7', 'Oppose federal bans on consumer products.', 10, 5);

-- eco18 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('eco18-far-left', 'eco18', 'Yes—universal paid leave with robust benefits.', -10, 1),
('eco18-center-left', 'eco18', 'Yes—national program with employer and payroll financing.', -5, 2),
('eco18-center', 'eco18', 'Yes—budget‑neutral design, small‑biz offsets, and state flexibility.', 0, 3),
('eco18-center-right', 'eco18', 'Prefer tax credits or employer‑led benefits; avoid mandates.', 5, 4),
('eco18-far-right', 'eco18', 'Oppose new federal entitlements.', 10, 5);

-- eco6 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('eco6-far-left', 'eco6', 'Yes—impose a wealth tax to reduce inequality.', -10, 1),
('eco6-center-left', 'eco6', 'Open to wealth/mark‑to‑market taxes on ultra‑wealthy.', -5, 2),
('eco6-center', 'eco6', 'Consider alternatives (minimum taxes) with administrability in mind.', 0, 3),
('eco6-center-right', 'eco6', 'Oppose wealth taxes; enforce current system instead.', 5, 4),
('eco6-far-right', 'eco6', 'Strongly oppose; unconstitutional/anti‑growth.', 10, 5);

-- gov6 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('gov6-far-left', 'gov6', 'Skeptical—demilitarize space; focus on civilian science.', -10, 1),
('gov6-center-left', 'gov6', 'Maintain if it improves readiness and coordination; ensure oversight.', -5, 2),
('gov6-center', 'gov6', 'Maintain with clear mission and budget discipline.', 0, 3),
('gov6-center-right', 'gov6', 'Yes—maintain and grow capabilities.', 5, 4),
('gov6-far-right', 'gov6', 'Strongly support an expanded Space Force.', 10, 5);

-- erm1 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('erm1-far-left', 'erm1', 'Yes—full voting rights and statehood.', -10, 1),
('erm1-center-left', 'erm1', 'Yes—D.C. statehood/self‑government with voting representation.', -5, 2),
('erm1-center', 'erm1', 'Yes—support full representation via statehood or equivalent remedy.', 0, 3),
('erm1-center-right', 'erm1', 'Oppose D.C. statehood; consider alternatives short of statehood.', 5, 4),
('erm1-far-right', 'erm1', 'No—maintain federal district; no new state.', 10, 5);

-- edu4 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('edu4-far-left', 'edu4', 'Skeptical—limit/ban charters; strengthen public schools.', -10, 1),
('edu4-center-left', 'edu4', 'Cautious—allow accountable, equitable charters.', -5, 2),
('edu4-center', 'edu4', 'Support high‑performing charters with strict accountability.', 0, 3),
('edu4-center-right', 'edu4', 'Yes—expand charter opportunities and parent choice.', 5, 4),
('edu4-far-right', 'edu4', 'Yes—broad charter expansion with minimal red tape.', 10, 5);

-- eco13 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('eco13-far-left', 'eco13', 'Yes—tax gains like wages and curb preferential rates.', -10, 1),
('eco13-center-left', 'eco13', 'Yes—raise rates for high earners and close loopholes.', -5, 2),
('eco13-center', 'eco13', 'Moderate increases with safeguards for investment and small business.', 0, 3),
('eco13-center-right', 'eco13', 'No—keep/lower rates to encourage investment and savings.', 5, 4),
('eco13-far-right', 'eco13', 'Lower/eliminate capital gains taxes.', 10, 5);

-- erm11 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('erm11-far-left', 'erm11', 'Yes—RCV and PR to reflect voter voices.', -10, 1),
('erm11-center-left', 'erm11', 'Open to RCV and other reforms that improve representation.', -5, 2),
('erm11-center', 'erm11', 'Yes—Forward strongly supports RCV and nonpartisan primaries.', 0, 3),
('erm11-center-right', 'erm11', 'Skeptical—traditional primaries and plurality voting preferred.', 5, 4),
('erm11-far-right', 'erm11', 'Strongly oppose RCV.', 10, 5);

-- social6 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('social6-far-left', 'social6', 'Review/limit exemptions if engaging in politics; maintain for charity.', -10, 1),
('social6-center-left', 'social6', 'Maintain exemptions with transparency/lobbying limits.', -5, 2),
('social6-center', 'social6', 'Maintain status; enforce clear rules on political activity.', 0, 3),
('social6-center-right', 'social6', 'Yes—protect tax‑exempt status and religious liberty.', 5, 4),
('social6-far-right', 'social6', 'Strongly support tax‑exempt status for religious institutions.', 10, 5);

-- social7 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('social7-far-left', 'social7', 'Yes—protect marriage equality in federal law.', -10, 1),
('social7-center-left', 'social7', 'Yes—codify protections and oppose discrimination.', -5, 2),
('social7-center', 'social7', 'Yes—protect existing rights; focus on equal treatment under law.', 0, 3),
('social7-center-right', 'social7', 'Respect existing law; protect religious liberty concerns.', 5, 4),
('social7-far-right', 'social7', 'Oppose redefining marriage; support traditional definitions.', 10, 5);

-- tech11 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('tech11-far-left', 'tech11', 'Yes—narrow immunity to fight harms while protecting speech.', -10, 1),
('tech11-center-left', 'tech11', 'Targeted reforms for transparency and safety.', -5, 2),
('tech11-center', 'tech11', 'Clarify duties of care without crushing small platforms.', 0, 3),
('tech11-center-right', 'tech11', 'Reform to deter censorship and illegal content.', 5, 4),
('tech11-far-right', 'tech11', 'Broader liability to enforce neutrality.', 10, 5);

-- tech15 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('tech15-far-left', 'tech15', 'Yes—more accountability for harmful content; protect civil liberties.', -10, 1),
('tech15-center-left', 'tech15', 'Targeted reforms: transparency, child safety, ads; avoid chilling speech.', -5, 2),
('tech15-center', 'tech15', 'Independent audits, transparency, and narrow liability for ads/illegal content.', 0, 3),
('tech15-center-right', 'tech15', 'Reform to curb perceived political bias and protect free speech.', 5, 4),
('tech15-far-right', 'tech15', 'Significantly narrow 230; allow lawsuits for censorship/harms.', 10, 5);

-- edu6 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('edu6-far-left', 'edu6', 'Yes—comprehensive sex ed nationwide.', -10, 1),
('edu6-center-left', 'edu6', 'Yes—evidence‑based, age‑appropriate sex ed.', -5, 2),
('edu6-center', 'edu6', 'Yes with local flexibility and parental notice/opt‑out.', 0, 3),
('edu6-center-right', 'edu6', 'Prefer abstinence‑focused/local choice; avoid federal mandates.', 5, 4),
('edu6-far-right', 'edu6', 'Oppose federal involvement; parents decide.', 10, 5);

-- tech21 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('tech21-far-left', 'tech21', 'Allow moderation to curb harms; ensure transparency and civil rights protections.', -10, 1),
('tech21-center-left', 'tech21', 'No neutrality mandate; require transparency and due‑process for users.', -5, 2),
('tech21-center', 'tech21', 'No neutrality mandate; adopt clear rules, audits, and appeals.', 0, 3),
('tech21-center-right', 'tech21', 'Consider guardrails to protect free expression and viewpoint diversity.', 5, 4),
('tech21-far-right', 'tech21', 'Yes—require neutrality and limit deplatforming.', 10, 5);

-- tech16 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('tech16-far-left', 'tech16', 'No—let platforms moderate; protect users from harm.', -10, 1),
('tech16-center-left', 'tech16', 'No government neutrality mandates; enforce transparency.', -5, 2),
('tech16-center', 'tech16', 'Require clear policies and due process, not political neutrality.', 0, 3),
('tech16-center-right', 'tech16', 'Encourage neutrality and viewpoint diversity; limit censorship.', 5, 4),
('tech16-far-right', 'tech16', 'Yes—neutrality rules to prevent political discrimination.', 10, 5);

-- cj12 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('cj12-far-left', 'cj12', 'Yes—ban except for brief emergencies; independent oversight.', -10, 1),
('cj12-center-left', 'cj12', 'Severely limit with strict health standards and review.', -5, 2),
('cj12-center', 'cj12', 'Limit duration and require medical/mental health safeguards.', 0, 3),
('cj12-center-right', 'cj12', 'Use sparingly with oversight; maintain for safety needs.', 5, 4),
('cj12-far-right', 'cj12', 'Keep available for discipline and protection.', 10, 5);

-- gov11 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('gov11-far-left', 'gov11', 'Keep national protections for rights; empower local democracy where helpful.', -10, 1),
('gov11-center-left', 'gov11', 'Balance—strong national standards for rights with state flexibility.', -5, 2),
('gov11-center', 'gov11', 'Devolve when it works; keep national guardrails for rights and markets.', 0, 3),
('gov11-center-right', 'gov11', 'Yes—return powers to states; limit federal agencies.', 5, 4),
('gov11-far-right', 'gov11', 'Strongly yes—strict Tenth Amendment reading.', 10, 5);

-- eco33 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('eco33-far-left', 'eco33', 'Yes—make discharge easier and cancel much existing debt.', -10, 1),
('eco33-center-left', 'eco33', 'Yes—restore a workable path to discharge and expand relief for borrowers in hardship.', -5, 2),
('eco33-center', 'eco33', 'Allow discharge in clear hardship cases; tighten school accountability.', 0, 3),
('eco33-center-right', 'eco33', 'Be cautious—encourage repayment and reform lending; limited bankruptcy options.', 5, 4),
('eco33-far-right', 'eco33', 'No—federal loans shouldn''t be easily discharged; end federal lending programs.', 10, 5);

-- edu8 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('edu8-far-left', 'edu8', 'No—keep guns out; invest in prevention and security measures.', -10, 1),
('edu8-center-left', 'edu8', 'Generally no—use trained security/SROs instead.', -5, 2),
('edu8-center', 'edu8', 'Decide locally; allow only with rigorous training and consent.', 0, 3),
('edu8-center-right', 'edu8', 'Allow trained, voluntary staff where communities choose.', 5, 4),
('edu8-far-right', 'edu8', 'Yes—broader allowance for armed staff with training.', 10, 5);

-- edu10 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('edu10-far-left', 'edu10', 'No—oppose pay tied to tests; invest in professional development.', -10, 1),
('edu10-center-left', 'edu10', 'Skeptical—use holistic evaluations, not test scores alone.', -5, 2),
('edu10-center', 'edu10', 'Allow local pilots with multiple measures and safeguards.', 0, 3),
('edu10-center-right', 'edu10', 'Yes—merit pay based on multiple outcomes.', 5, 4),
('edu10-far-right', 'edu10', 'Favor merit pay and local control without federal rules.', 10, 5);

-- eco47 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('eco47-far-left', 'eco47', 'Yes—public investment with labor and community benefits.', -10, 1),
('eco47-center-left', 'eco47', 'Yes—targeted investments with Buy America and labor standards.', -5, 2),
('eco47-center', 'eco47', 'Yes—targeted, time‑limited subsidies with clear benchmarks.', 0, 3),
('eco47-center-right', 'eco47', 'Support targeted incentives; reduce regulation/taxes broadly.', 5, 4),
('eco47-far-right', 'eco47', 'Prefer market solutions; limit federal picking of winners.', 10, 5);

-- eco14 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('eco14-far-left', 'eco14', 'Yes—shift subsidies to small/regenerative farms and climate practices.', -10, 1),
('eco14-center-left', 'eco14', 'Yes—support farmers with conservation and market stability programs.', -5, 2),
('eco14-center', 'eco14', 'Yes—targeted, means‑tested, outcomes‑based programs.', 0, 3),
('eco14-center-right', 'eco14', 'Reduce distortions; focus on risk management and markets.', 5, 4),
('eco14-far-right', 'eco14', 'Phase down federal subsidies.', 10, 5);

-- eco1 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('eco1-far-left', 'eco1', 'Yes—significantly raise and index to cost of living.', -10, 1),
('eco1-center-left', 'eco1', 'Yes—raise gradually and index; support small‑business help.', -5, 2),
('eco1-center', 'eco1', 'Yes where local costs justify; consider regional/sector phase‑ins.', 0, 3),
('eco1-center-right', 'eco1', 'Skeptical—prefer EITC/skills and let states set wages.', 5, 4),
('eco1-far-right', 'eco1', 'Oppose federal minimum wage; leave to states/markets.', 10, 5);

-- tech26 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('tech26-far-left', 'tech26', 'Yes—mandate audits, fairness standards, and transparency.', -10, 1),
('tech26-center-left', 'tech26', 'Yes—civil rights protections and oversight for high‑risk AI uses.', -5, 2),
('tech26-center', 'tech26', 'Yes—risk‑tiered audits and due process; publish impact assessments.', 0, 3),
('tech26-center-right', 'tech26', 'Prefer industry standards; avoid heavy mandates; enforce existing laws.', 5, 4),
('tech26-far-right', 'tech26', 'Minimal federal rules; let states/markets decide.', 10, 5);

-- tech1 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('tech1-far-left', 'tech1', 'Yes—break up Big Tech and enforce strong antitrust.', -10, 1),
('tech1-center-left', 'tech1', 'Yes—tough antitrust and pro‑competition rules.', -5, 2),
('tech1-center', 'tech1', 'Strengthen enforcement; target conduct not size; clear rules.', 0, 3),
('tech1-center-right', 'tech1', 'Cautious—enforce existing laws, avoid overreach.', 5, 4),
('tech1-far-right', 'tech1', 'Oppose new federal breakups; market should decide.', 10, 5);

-- tech27 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('tech27-far-left', 'tech27', 'Yes—use strong antitrust to break up Big Tech and curb monopolies.', -10, 1),
('tech27-center-left', 'tech27', 'Yes—stronger antitrust and competition rules; break up when necessary.', -5, 2),
('tech27-center', 'tech27', 'Yes—modernize antitrust with clear, evidence-based tests; avoid blunt bans.', 0, 3),
('tech27-center-right', 'tech27', 'Focus on innovation and fair rules; skeptical of breakups absent clear harm.', 5, 4),
('tech27-far-right', 'tech27', 'Limit federal economic intervention; target only clear abuses of power.', 10, 5);

-- health14 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('health14-far-left', 'health14', 'Yes—set or cap prices and end price gouging.', -10, 1),
('health14-center-left', 'health14', 'Yes—expand transparency and targeted caps/negotiation where markets fail.', -5, 2),
('health14-center', 'health14', 'Use transparency, reference pricing, and site‑neutral payments; measure outcomes.', 0, 3),
('health14-center-right', 'health14', 'No federal price controls; promote competition and transparency instead.', 5, 4),
('health14-far-right', 'health14', 'Oppose federal price regulation.', 10, 5);

-- eco11 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('eco11-far-left', 'eco11', 'Yes—toughen rules on trading, disclosure, and corporate governance.', -10, 1),
('eco11-center-left', 'eco11', 'Strengthen investor protections and enforcement.', -5, 2),
('eco11-center', 'eco11', 'Targeted reforms for transparency and systemic risk; avoid overreach.', 0, 3),
('eco11-center-right', 'eco11', 'Caution against heavier rules that stifle growth; enforce existing law.', 5, 4),
('eco11-far-right', 'eco11', 'Reduce federal regulation; empower states/markets.', 10, 5);

-- tech18 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('tech18-far-left', 'tech18', 'Yes—strict anti‑bias rules and audits; public transparency.', -10, 1),
('tech18-center-left', 'tech18', 'Yes—federal standards, impact assessments, and enforcement.', -5, 2),
('tech18-center', 'tech18', 'Yes—risk‑based regulation and third‑party audits.', 0, 3),
('tech18-center-right', 'tech18', 'Limited, sector‑specific rules; avoid stifling innovation.', 5, 4),
('tech18-far-right', 'tech18', 'Minimal new federal rules; states decide.', 10, 5);

-- dp3 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('dp3-far-left', 'dp3', 'Yes—universal background checks and licensing.', -10, 1),
('dp3-center-left', 'dp3', 'Yes—close loopholes with universal checks.', -5, 2),
('dp3-center', 'dp3', 'Yes—background checks with due‑process protections.', 0, 3),
('dp3-center-right', 'dp3', 'Oppose new federal mandates; enforce existing laws.', 5, 4),
('dp3-far-right', 'dp3', 'No—protect private sales and Second Amendment rights.', 10, 5);

-- eco19 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('eco19-far-left', 'eco19', 'Yes—universal childcare and early education.', -10, 1),
('eco19-center-left', 'eco19', 'Yes—expand subsidies/tax credits and quality standards.', -5, 2),
('eco19-center', 'eco19', 'Yes—means‑tested support; expand supply via licensing reforms.', 0, 3),
('eco19-center-right', 'eco19', 'Targeted credits for low‑income families; encourage employer benefits.', 5, 4),
('eco19-far-right', 'eco19', 'Oppose universal subsidies at federal level.', 10, 5);

-- edu2 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('edu2-far-left', 'edu2', 'No—invest in public schools, not vouchers.', -10, 1),
('edu2-center-left', 'edu2', 'Mostly no—limited pilots only; focus on public school improvement.', -5, 2),
('edu2-center', 'edu2', 'Consider means‑tested vouchers/ESAs with accountability if outcomes improve.', 0, 3),
('edu2-center-right', 'edu2', 'Yes—expand voucher programs and education savings accounts.', 5, 4),
('edu2-far-right', 'edu2', 'Strongly support broad school choice.', 10, 5);

-- ct5 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('ct5-far-left', 'ct5', 'Yes—include Taiwan in global health governance.', -10, 1),
('ct5-center-left', 'ct5', 'Yes—support Taiwan''s meaningful participation in international bodies.', -5, 2),
('ct5-center', 'ct5', 'Yes—advocate for Taiwan''s inclusion pragmatically.', 0, 3),
('ct5-center-right', 'ct5', 'Yes—support Taiwan on the world stage and counter CCP pressure.', 5, 4),
('ct5-far-right', 'ct5', 'Strongly support Taiwan''s full international participation.', 10, 5);

-- ip3 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('ip3-far-left', 'ip3', 'Yes—recognize to advance peace and rights.', -10, 1),
('ip3-center-left', 'ip3', 'Prefer recognition via negotiations and international process.', -5, 2),
('ip3-center', 'ip3', 'Condition recognition on security guarantees and governance reforms.', 0, 3),
('ip3-center-right', 'ip3', 'No—recognition must follow direct negotiations with Israel.', 5, 4),
('ip3-far-right', 'ip3', 'Oppose U.S. recognition absent Israeli consent.', 10, 5);

-- fp17 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('fp17-far-left', 'fp17', 'No—prefer diplomacy and development; avoid broad sanctions.', -10, 1),
('fp17-center-left', 'fp17', 'Use targeted sanctions alongside diplomacy and relief.', -5, 2),
('fp17-center', 'fp17', 'Use focused, coalition sanctions with clear goals and off‑ramps.', 0, 3),
('fp17-center-right', 'fp17', 'Yes—use sanctions vigorously to deter adversaries.', 5, 4),
('fp17-far-right', 'fp17', 'Favor broad sanctions to defend U.S. interests.', 10, 5);

-- eco7 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('eco7-far-left', 'eco7', 'Prefer standards and fair trade, not tariffs that raise prices.', -10, 1),
('eco7-center-left', 'eco7', 'Targeted trade enforcement; avoid broad tariffs that hurt consumers.', -5, 2),
('eco7-center', 'eco7', 'Use strategic, time‑limited tariffs when clearly justified.', 0, 3),
('eco7-center-right', 'eco7', 'Use tariffs sparingly; prioritize free trade and competitiveness.', 5, 4),
('eco7-far-right', 'eco7', 'Support protective tariffs for sovereignty and industry.', 10, 5);

-- fp13 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('fp13-far-left', 'fp13', 'Yes—phase out overseas bases and emphasize diplomacy.', -10, 1),
('fp13-center-left', 'fp13', 'No—maintain alliance presence while pursuing diplomacy.', -5, 2),
('fp13-center', 'fp13', 'Maintain troops with periodic reviews of burden‑sharing.', 0, 3),
('fp13-center-right', 'fp13', 'No—keep troops to deter North Korea and support allies.', 5, 4),
('fp13-far-right', 'fp13', 'Reevaluate and reduce foreign deployments substantially.', 10, 5);

-- erm10 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('erm10-far-left', 'erm10', 'Prefer competency and transparency tests, not age bans.', -10, 1),
('erm10-center-left', 'erm10', 'No blanket age cap; ensure fitness and transparency.', -5, 2),
('erm10-center', 'erm10', 'No—let voters decide; consider independent health disclosures.', 0, 3),
('erm10-center-right', 'erm10', 'No new constitutional age caps.', 5, 4),
('erm10-far-right', 'erm10', 'No—stick with Constitution''s age rules.', 10, 5);

-- tech31 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('tech31-far-left', 'tech31', 'Yes—protect end‑to‑end encryption; no backdoors.', -10, 1),
('tech31-center-left', 'tech31', 'Protect strong encryption with narrow, court‑approved access paths.', -5, 2),
('tech31-center', 'tech31', 'Allow strong encryption; define narrow emergency exceptions and warrants.', 0, 3),
('tech31-center-right', 'tech31', 'Support lawful access solutions; avoid blanket mandates.', 5, 4),
('tech31-far-right', 'tech31', 'Favor strong investigative powers over encryption barriers.', 10, 5);

-- tech32 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('tech32-far-left', 'tech32', 'Yes—strong national privacy rights and limits on data collection.', -10, 1),
('tech32-center-left', 'tech32', 'Yes—comprehensive federal privacy with enforcement and user rights.', -5, 2),
('tech32-center', 'tech32', 'Yes—clear rights, portability, opt-out, and small-business guardrails.', 0, 3),
('tech32-center-right', 'tech32', 'Prefer lighter federal privacy rules; avoid heavy mandates that stifle business.', 5, 4),
('tech32-far-right', 'tech32', 'Limit federal role; empower states and individuals.', 10, 5);

-- tech33 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('tech33-far-left', 'tech33', 'Yes—strong nationwide privacy rights and limits on data collection.', -10, 1),
('tech33-center-left', 'tech33', 'Yes—comprehensive privacy law with enforcement.', -5, 2),
('tech33-center', 'tech33', 'Yes—clear rights (access/delete), preemption, and workable rules.', 0, 3),
('tech33-center-right', 'tech33', 'Maybe—baseline privacy with flexibility for innovation.', 5, 4),
('tech33-far-right', 'tech33', 'Skeptical of broad federal mandates; let states/markets lead.', 10, 5);

-- social11 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('social11-far-left', 'social11', 'Yes—protect access nationwide for adults and age‑appropriate care for youth.', -10, 1),
('social11-center-left', 'social11', 'Yes—ensure access and medical standards; respect parental/clinical roles.', -5, 2),
('social11-center', 'social11', 'Protect adult access; for minors, follow evidence and expert standards with oversight.', 0, 3),
('social11-center-right', 'social11', 'Skeptical; prefer state regulation and parental rights; restrict youth procedures.', 5, 4),
('social11-far-right', 'social11', 'Oppose federal protections; restrict or prohibit procedures, especially for minors.', 10, 5);

-- eco22 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('eco22-far-left', 'eco22', 'Yes—small tax to curb speculation and raise revenue.', -10, 1),
('eco22-center-left', 'eco22', 'Open to modest FTT with safeguards for pensions/retirees.', -5, 2),
('eco22-center', 'eco22', 'Consider only with strong evidence of net benefit; international coordination.', 0, 3),
('eco22-center-right', 'eco22', 'Oppose FTT; harms liquidity and savers.', 5, 4),
('eco22-far-right', 'eco22', 'Strongly oppose FTT.', 10, 5);

-- social16 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('social16-far-left', 'social16', 'Yes—mandatory buyback for high‑risk weapons.', -10, 1),
('social16-center-left', 'social16', 'Consider targeted buybacks and bans with due process.', -5, 2),
('social16-center', 'social16', 'Focus on permits/background checks; voluntary buybacks; enforce laws.', 0, 3),
('social16-center-right', 'social16', 'Oppose mandatory buybacks; protect Second Amendment.', 5, 4),
('social16-far-right', 'social16', 'Strongly oppose; expand gun rights.', 10, 5);

-- cj10 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('cj10-far-left', 'cj10', 'Yes—national database with public access and independent oversight.', -10, 1),
('cj10-center-left', 'cj10', 'Yes—federal database with appropriate privacy protections.', -5, 2),
('cj10-center', 'cj10', 'Yes—centralized, searchable system for law enforcement with oversight.', 0, 3),
('cj10-center-right', 'cj10', 'Consider carefully; protect officers'' due process rights.', 5, 4),
('cj10-far-right', 'cj10', 'Oppose federal mandate; leave to states.', 10, 5);

-- edu5 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('edu5-far-left', 'edu5', 'Cancel significant debt and make college tuition‑free going forward.', -10, 1),
('edu5-center-left', 'edu5', 'Targeted forgiveness and income‑based repayment reforms.', -5, 2),
('edu5-center', 'edu5', 'Reform repayment; targeted relief for high‑need borrowers and fraud cases.', 0, 3),
('edu5-center-right', 'edu5', 'Reduce tuition via competition/alternatives; limited relief for fraud/servicemembers.', 5, 4),
('edu5-far-right', 'edu5', 'End federal lending programs; personal responsibility for debt.', 10, 5);

-- fp16 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('fp16-far-left', 'fp16', 'Peace, human rights, and demilitarization.', -10, 1),
('fp16-center-left', 'fp16', 'Protect Americans while advancing democracy and alliances.', -5, 2),
('fp16-center', 'fp16', 'Protect security and prosperity through coalitions and trade.', 0, 3),
('fp16-center-right', 'fp16', 'American strength, security, and leadership.', 5, 4),
('fp16-far-right', 'fp16', 'Protect U.S. sovereignty and interests first.', 10, 5);

-- ct2 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('ct2-far-left', 'ct2', 'Reduce dependence and protect labor/environment; avoid corporate‑driven trade.', -10, 1),
('ct2-center-left', 'ct2', 'De‑risk supply chains with allies; enforce fair trade and labor rules.', -5, 2),
('ct2-center', 'ct2', 'Balanced de‑risking while keeping trade open where it helps Americans.', 0, 3),
('ct2-center-right', 'ct2', 'Get tough on Beijing''s abuses; use tariffs and leverage where needed.', 5, 4),
('ct2-far-right', 'ct2', 'Economic nationalism—high tariffs and disengagement.', 10, 5);

-- fp8 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('fp8-far-left', 'fp8', 'De‑escalate and prioritize diplomacy and arms control.', -10, 1),
('fp8-center-left', 'fp8', 'Deter aggression, support allies, and pursue arms control.', -5, 2),
('fp8-center', 'fp8', 'Firm deterrence plus clear diplomatic off‑ramps.', 0, 3),
('fp8-center-right', 'fp8', 'Confront aggression and strengthen NATO.', 5, 4),
('fp8-far-right', 'fp8', 'Maximize U.S. leverage and energy dominance; avoid concessions.', 10, 5);

-- ip6 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('ip6-far-left', 'ip6', 'Yes—call for a permanent cease-fire now; halt U.S. military aid; center Palestinian rights.', -10, 1),
('ip6-center-left', 'ip6', 'Yes—cease-fire paired with verified hostage release and scaled humanitarian access.', -5, 2),
('ip6-center', 'ip6', 'Negotiated truce with monitoring, hostage release, and mutual security guarantees.', 0, 3),
('ip6-center-right', 'ip6', 'Support limited pauses and diplomacy but avoid pressure for a permanent cease-fire.', 5, 4),
('ip6-far-right', 'ip6', 'No—oppose U.S. calls for a permanent cease-fire; support Israel''s operations.', 10, 5);

-- ip7 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('ip7-far-left', 'ip7', 'No—call for cease-fire first; negotiate hostages concurrently.', -10, 1),
('ip7-center-left', 'ip7', 'Yes—pair cease-fire with immediate, verified hostage release and expanded aid.', -5, 2),
('ip7-center', 'ip7', 'Yes—lockstep truce terms, verified exchanges, third‑party monitoring.', 0, 3),
('ip7-center-right', 'ip7', 'Yes—no cease-fire call without verified release and security assurances for Israel.', 5, 4),
('ip7-far-right', 'ip7', 'Yes—release and disarmament steps before any cease-fire endorsement.', 10, 5);

-- ip8 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('ip8-far-left', 'ip8', 'No—only a permanent cease-fire protects civilians.', -10, 1),
('ip8-center-left', 'ip8', 'Yes—if it expands aid access and builds toward a broader truce.', -5, 2),
('ip8-center', 'ip8', 'Yes—short pauses for aid and talks with oversight.', 0, 3),
('ip8-center-right', 'ip8', 'Yes—brief pauses while Israel retains operational freedom.', 5, 4),
('ip8-far-right', 'ip8', 'Yes—only if pauses don''t hinder Israeli objectives.', 10, 5);

-- ip9 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('ip9-far-left', 'ip9', 'Yes—empower mediators to secure broad exchanges and de‑escalation.', -10, 1),
('ip9-center-left', 'ip9', 'Yes—with U.S. diplomatic support and humanitarian safeguards.', -5, 2),
('ip9-center', 'ip9', 'Yes—pragmatic mediated exchanges with verification and timelines.', 0, 3),
('ip9-center-right', 'ip9', 'Yes—via trusted partners while sustaining U.S.–Israel coordination.', 5, 4),
('ip9-far-right', 'ip9', 'Yes—only if it advances Israel''s security; no concessions that strengthen terror groups.', 10, 5);

-- ip10 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('ip10-far-left', 'ip10', 'Yes—international presence to protect civilians and reconstruction.', -10, 1),
('ip10-center-left', 'ip10', 'Yes—multinational mission with human‑rights oversight.', -5, 2),
('ip10-center', 'ip10', 'Yes—time‑limited mission with benchmarks and local transition.', 0, 3),
('ip10-center-right', 'ip10', 'Maybe—only if it protects Israel''s security and avoids mission creep.', 5, 4),
('ip10-far-right', 'ip10', 'No—oppose commitments that draw the U.S. into long‑term policing roles.', 10, 5);

-- ip11 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('ip11-far-left', 'ip11', 'Yes—restore and increase funding for humanitarian needs.', -10, 1),
('ip11-center-left', 'ip11', 'Yes—with strict vetting, audits, and metrics.', -5, 2),
('ip11-center', 'ip11', 'Yes—conditional funding with independent monitoring.', 0, 3),
('ip11-center-right', 'ip11', 'Skeptical—require major reforms before restoring funds.', 5, 4),
('ip11-far-right', 'ip11', 'No—defund UNRWA; use alternative humanitarian channels.', 10, 5);