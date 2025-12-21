-- Add more missing questions and options

-- Criminal Justice
INSERT INTO questions (id, topic_id, text) VALUES
('cj9', 'criminal-justice', 'Should civil asset forfeiture be abolished?'),
('cj6', 'criminal-justice', 'Should felons have their voting rights restored after completing their sentences?'),
('cj14', 'criminal-justice', 'Should the federal government reinstate the ban on "assault weapons"?')
ON CONFLICT (id) DO NOTHING;

-- Education
INSERT INTO questions (id, topic_id, text) VALUES
('edu15', 'education', 'Should colleges and universities be allowed to consider "legacy" status in admissions?'),
('edu18', 'education', 'Should computer programming and coding be a required subject in K‑12 schools?')
ON CONFLICT (id) DO NOTHING;

-- Technology
INSERT INTO questions (id, topic_id, text) VALUES
('tech8', 'technology', 'Should companies be allowed to collect and sell user data?'),
('tech14', 'technology', 'Should companies be held legally liable for harm caused by their AI systems?'),
('tech17', 'technology', 'Should the federal government promote the development and use of open-source software?')
ON CONFLICT (id) DO NOTHING;

-- Social Issues
INSERT INTO questions (id, topic_id, text) VALUES
('social14', 'social-issues', 'Should Confederate monuments and symbols be removed from public spaces?'),
('social2', 'social-issues', 'Should Congress pass a federal law protecting access to contraception nationwide?'),
('social19', 'social-issues', 'Should conversion therapy for minors be banned nationwide?'),
('social3', 'social-issues', 'Should employers be allowed to consider a candidate''s social media posts in hiring decisions?')
ON CONFLICT (id) DO NOTHING;

-- Environment
INSERT INTO questions (id, topic_id, text) VALUES
('env6', 'environment', 'Should drilling for oil be allowed in the Arctic National Wildlife Refuge (ANWR)?')
ON CONFLICT (id) DO NOTHING;

-- Electoral Reform
INSERT INTO questions (id, topic_id, text) VALUES
('erm8', 'electoral-reform', 'Should Election Day be a national holiday?')
ON CONFLICT (id) DO NOTHING;

-- Domestic Policy
INSERT INTO questions (id, topic_id, text) VALUES
('dp18', 'domestic-policy', 'Should the federal government increase investment in infrastructure and services for rural communities?'),
('dp16', 'domestic-policy', 'Should the federal government provide funding for public broadcasting (e.g., PBS, NPR)?'),
('dp19', 'domestic-policy', 'Should the federal government provide funding for states to implement universal pre-kindergarten programs?'),
('dp20', 'domestic-policy', 'Should the federal government provide funding for states to implement universal pre‑kindergarten programs?')
ON CONFLICT (id) DO NOTHING;

-- Economy
INSERT INTO questions (id, topic_id, text) VALUES
('eco41', 'economy', 'Should the federal government invest directly in creating jobs during economic downturns?'),
('eco45', 'economy', 'Should the federal government invest directly in creating jobs during economic downturns (public works)?'),
('eco46', 'economy', 'Should the federal government mandate paid sick days?'),
('eco29', 'economy', 'Should the federal government mandate that employers provide a certain number of paid sick days?'),
('eco36', 'economy', 'Should the federal government offer tax incentives for businesses to adopt automation and AI technologies?'),
('eco39', 'economy', 'Should the federal government provide subsidies for industries transitioning to green energy?')
ON CONFLICT (id) DO NOTHING;

-- Add options for new questions

-- cj9 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('cj9-far-left', 'cj9', 'Yes—abolish or require conviction first.', -10, 1),
('cj9-center-left', 'cj9', 'Yes—ban or set strict federal standards (conviction, transparency).', -5, 2),
('cj9-center', 'cj9', 'Yes—require conviction and auditing; end equitable sharing abuses.', 0, 3),
('cj9-center-right', 'cj9', 'Reform to protect property rights; tighten standards.', 5, 4),
('cj9-far-right', 'cj9', 'Oppose abolition; allow with strong safeguards.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- edu15 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('edu15-far-left', 'edu15', 'No—ban legacy preferences.', -10, 1),
('edu15-center-left', 'edu15', 'Discourage/limit legacy; expand access for underserved students.', -5, 2),
('edu15-center', 'edu15', 'Phase down legacy preferences in favor of transparent criteria.', 0, 3),
('edu15-center-right', 'edu15', 'Let institutions decide; government should not micromanage admissions.', 5, 4),
('edu15-far-right', 'edu15', 'No federal role in private admissions policies.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- tech8 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('tech8-far-left', 'tech8', 'Ban most sale of personal data; strict consent rules.', -10, 1),
('tech8-center-left', 'tech8', 'Allow only with explicit consent and strong limits.', -5, 2),
('tech8-center', 'tech8', 'Allow with opt‑in and transparency; heavy penalties for abuse.', 0, 3),
('tech8-center-right', 'tech8', 'Allow data markets with clear notice/choice.', 5, 4),
('tech8-far-right', 'tech8', 'Limit federal rules; let states/markets shape practices.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- tech14 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('tech14-far-left', 'tech14', 'Yes—clear liability and strong consumer protections.', -10, 1),
('tech14-center-left', 'tech14', 'Yes—duty of care and safe‑harbor for compliance.', -5, 2),
('tech14-center', 'tech14', 'Yes—proportionate liability tied to risk and standards.', 0, 3),
('tech14-center-right', 'tech14', 'Limited liability frameworks; avoid chilling innovation.', 5, 4),
('tech14-far-right', 'tech14', 'Oppose expansive liability; prefer minimal regulation.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- edu18 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('edu18-far-left', 'edu18', 'Yes—expand STEM/tech access for all students.', -10, 1),
('edu18-center-left', 'edu18', 'Encourage coding requirements and STEM pathways with funding.', -5, 2),
('edu18-center', 'edu18', 'Support states adding coding where it fits; focus on outcomes.', 0, 3),
('edu18-center-right', 'edu18', 'Promote CTE/apprenticeships; leave mandates to states.', 5, 4),
('edu18-far-right', 'edu18', 'No federal mandates on curriculum.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- social14 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('social14-far-left', 'social14', 'Yes—remove/relocate to museums; promote inclusive spaces.', -10, 1),
('social14-center-left', 'social14', 'Yes—decide locally with community input; contextualize history.', -5, 2),
('social14-center', 'social14', 'Local democratic process; add context or relocate where divisive.', 0, 3),
('social14-center-right', 'social14', 'Prefer local control and preservation of history; add context plaques.', 5, 4),
('social14-far-right', 'social14', 'Keep monuments; oppose removal.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- social2 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('social2-far-left', 'social2', 'Yes—guarantee nationwide access and affordability.', -10, 1),
('social2-center-left', 'social2', 'Yes—protect access and insurance coverage.', -5, 2),
('social2-center', 'social2', 'Yes—protect access while respecting conscience exemptions with alternatives.', 0, 3),
('social2-center-right', 'social2', 'Prefer state decisions; protect conscience rights.', 5, 4),
('social2-far-right', 'social2', 'Oppose new federal mandates.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- social19 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('social19-far-left', 'social19', 'Yes—ban as harmful and unscientific.', -10, 1),
('social19-center-left', 'social19', 'Yes—federal protections for minors.', -5, 2),
('social19-center', 'social19', 'Yes—ban coercive practices; protect counseling freedom.', 0, 3),
('social19-center-right', 'social19', 'Prefer state oversight and parental rights; cautious on federal bans.', 5, 4),
('social19-far-right', 'social19', 'Oppose federal bans; defend parental/faith counseling rights.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- env6 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('env6-far-left', 'env6', 'No—protect ANWR from drilling.', -10, 1),
('env6-center-left', 'env6', 'Oppose ANWR drilling; protect critical habitats.', -5, 2),
('env6-center', 'env6', 'No new leases unless strict science shows minimal impact (unlikely).', 0, 3),
('env6-center-right', 'env6', 'Yes—with strict environmental safeguards and local benefits.', 5, 4),
('env6-far-right', 'env6', 'Yes—develop ANWR resources for energy independence.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- erm8 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('erm8-far-left', 'erm8', 'Yes—make voting easier with a federal holiday and expanded early voting.', -10, 1),
('erm8-center-left', 'erm8', 'Yes—expand access with early/mail voting and a voting holiday.', -5, 2),
('erm8-center', 'erm8', 'Encourage states/federal workforce to provide leave; pair with early voting.', 0, 3),
('erm8-center-right', 'erm8', 'Skeptical—focus on secure processes and existing early voting.', 5, 4),
('erm8-far-right', 'erm8', 'Oppose creating a new federal holiday for voting.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- social3 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('social3-far-left', 'social3', 'Limit use; protect privacy and anti‑discrimination.', -10, 1),
('social3-center-left', 'social3', 'Allow limited, relevant checks with transparency and fairness.', -5, 2),
('social3-center', 'social3', 'Allow job‑related review with disclosure and appeal rights.', 0, 3),
('social3-center-right', 'social3', 'Yes within law; employer discretion.', 5, 4),
('social3-far-right', 'social3', 'Yes—private employers decide; minimal regulation.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- cj6 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('cj6-far-left', 'cj6', 'Yes—restore automatically; remove all barriers.', -10, 1),
('cj6-center-left', 'cj6', 'Yes—restore after sentence completion; simplify process.', -5, 2),
('cj6-center', 'cj6', 'Yes—restore with exceptions for election crimes; clear process.', 0, 3),
('cj6-center-right', 'cj6', 'Consider case-by-case restoration after probation/parole.', 5, 4),
('cj6-far-right', 'cj6', 'Oppose automatic restoration.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- tech17 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('tech17-far-left', 'tech17', 'Yes—use and fund open-source to reduce vendor lock‑in.', -10, 1),
('tech17-center-left', 'tech17', 'Yes—adopt open standards/open-source where efficient and secure.', -5, 2),
('tech17-center', 'tech17', 'Yes—open-source by default for non‑sensitive systems; assess TCO/security.', 0, 3),
('tech17-center-right', 'tech17', 'Support open-source where cost‑effective; avoid mandates.', 5, 4),
('tech17-far-right', 'tech17', 'Minimal federal IT mandates; agency choice.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- dp18 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('dp18-far-left', 'dp18', 'Yes—major public investment to close rural gaps.', -10, 1),
('dp18-center-left', 'dp18', 'Yes—expand broadband, healthcare, and infrastructure investments.', -5, 2),
('dp18-center', 'dp18', 'Yes—targeted investments with accountability and outcomes focus.', 0, 3),
('dp18-center-right', 'dp18', 'Support targeted incentives and private build‑out; cut red tape.', 5, 4),
('dp18-far-right', 'dp18', 'Minimal federal role; states and markets address rural needs.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- eco41 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('eco41-far-left', 'eco41', 'Yes—large public works and green jobs programs.', -10, 1),
('eco41-center-left', 'eco41', 'Yes—counter‑cyclical public investment and hiring.', -5, 2),
('eco41-center', 'eco41', 'Yes when needed, with sunset clauses and ROI tests.', 0, 3),
('eco41-center-right', 'eco41', 'Prefer tax relief and deregulation over direct federal hiring.', 5, 4),
('eco41-far-right', 'eco41', 'Oppose federal job programs; leave to states and markets.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- eco45 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('eco45-far-left', 'eco45', 'Yes—major public works and green jobs programs.', -10, 1),
('eco45-center-left', 'eco45', 'Yes—counter‑cyclical infrastructure and community investments.', -5, 2),
('eco45-center', 'eco45', 'Yes—temporary, high‑ROI projects with rapid deployment.', 0, 3),
('eco45-center-right', 'eco45', 'Prefer tax relief/regulatory reforms; limited direct jobs programs.', 5, 4),
('eco45-far-right', 'eco45', 'Oppose large federal jobs programs.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- eco46 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('eco46-far-left', 'eco46', 'Yes—national paid sick leave standards.', -10, 1),
('eco46-center-left', 'eco46', 'Yes—baseline national standard with small‑biz support.', -5, 2),
('eco46-center', 'eco46', 'Yes—flexible, low‑burden standard; state innovation allowed.', 0, 3),
('eco46-center-right', 'eco46', 'Prefer employer choice/tax credits; avoid mandates.', 5, 4),
('eco46-far-right', 'eco46', 'Oppose federal labor mandates.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- eco29 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('eco29-far-left', 'eco29', 'Yes—federal mandate for at least 7–10 paid sick days with strong enforcement.', -10, 1),
('eco29-center-left', 'eco29', 'Yes—set a national floor (e.g., 7 days) with small‑business assistance.', -5, 2),
('eco29-center', 'eco29', 'Targeted federal minimum or incentives; evaluate impacts via phased implementation.', 0, 3),
('eco29-center-right', 'eco29', 'Prefer tax credits or voluntary policies; avoid mandates that burden small employers.', 5, 4),
('eco29-far-right', 'eco29', 'No federal mandate; leave benefits to employers and states.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- eco36 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('eco36-far-left', 'eco36', 'Tie any incentives to worker protections/training; prefer public investment.', -10, 1),
('eco36-center-left', 'eco36', 'Yes—pair incentives with worker upskilling and safeguards.', -5, 2),
('eco36-center', 'eco36', 'Yes—target productivity with workforce programs and accountability.', 0, 3),
('eco36-center-right', 'eco36', 'Yes—pro‑innovation tax policy without heavy strings.', 5, 4),
('eco36-far-right', 'eco36', 'Prefer broad tax cuts over targeted incentives.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- dp16 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('dp16-far-left', 'dp16', 'Yes—expand stable public media funding.', -10, 1),
('dp16-center-left', 'dp16', 'Yes—continue funding independent public media.', -5, 2),
('dp16-center', 'dp16', 'Maintain funding with accountability.', 0, 3),
('dp16-center-right', 'dp16', 'Reduce or eliminate federal funding; private support instead.', 5, 4),
('dp16-far-right', 'dp16', 'End federal funding for public broadcasting.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- dp19 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('dp19-far-left', 'dp19', 'Yes—universal publicly funded pre‑K.', -10, 1),
('dp19-center-left', 'dp19', 'Yes—partner with states for universal, high‑quality pre‑K.', -5, 2),
('dp19-center', 'dp19', 'Pilot and scale where results are strong.', 0, 3),
('dp19-center-right', 'dp19', 'Prefer targeted aid and parental choice; avoid federal mandates.', 5, 4),
('dp19-far-right', 'dp19', 'Oppose new federal entitlements.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- dp20 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('dp20-far-left', 'dp20', 'Yes—universal, publicly funded pre‑K.', -10, 1),
('dp20-center-left', 'dp20', 'Yes—expand universal pre‑K and child care.', -5, 2),
('dp20-center', 'dp20', 'Yes—evidence‑based pre‑K with state flexibility and quality standards.', 0, 3),
('dp20-center-right', 'dp20', 'Prefer block grants/credits and parental choice; avoid federal mandates.', 5, 4),
('dp20-far-right', 'dp20', 'Oppose new federal early‑ed entitlements.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- eco39 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('eco39-far-left', 'eco39', 'Yes—massive investment in clean energy and jobs.', -10, 1),
('eco39-center-left', 'eco39', 'Yes—expand clean energy incentives and standards.', -5, 2),
('eco39-center', 'eco39', 'Yes—time‑limited, tech‑neutral incentives tied to outcomes.', 0, 3),
('eco39-center-right', 'eco39', 'Prefer innovation/permits/competition; reduce targeted subsidies.', 5, 4),
('eco39-far-right', 'eco39', 'Oppose green subsidies.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- cj14 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('cj14-far-left', 'cj14', 'Yes—reinstate and strengthen the ban.', -10, 1),
('cj14-center-left', 'cj14', 'Yes—support a renewed federal ban on assault weapons.', -5, 2),
('cj14-center', 'cj14', 'Enforce universal background checks; consider limited restrictions.', 0, 3),
('cj14-center-right', 'cj14', 'Oppose new bans; enforce existing laws.', 5, 4),
('cj14-far-right', 'cj14', 'Strongly oppose; expand gun rights.', 10, 5)
ON CONFLICT (id) DO NOTHING;