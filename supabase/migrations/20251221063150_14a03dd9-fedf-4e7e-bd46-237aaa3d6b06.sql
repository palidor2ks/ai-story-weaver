-- Add all missing questions and their options from the spreadsheet

-- First, add all missing questions
INSERT INTO public.questions (id, topic_id, text, is_onboarding_canonical, onboarding_slot) VALUES
-- Criminal Justice (missing)
('cj3', 'criminal-justice', 'Should the government ban the use of private prisons?', false, null),
('cj4', 'criminal-justice', 'What is your stance on police reform?', false, null),
('cj5', 'criminal-justice', 'Should the cash bail system be eliminated?', false, null),
('cj8', 'criminal-justice', 'Should the federal government decriminalize marijuana?', false, null),
('cj13', 'criminal-justice', 'Should juvenile offenders be tried as adults for serious crimes?', false, null),
('cj16', 'criminal-justice', 'Should the federal government be allowed to use the death penalty?', false, null),
('cj17', 'criminal-justice', 'Should there be a national standard for police use of force, limiting tactics like chokeholds and no‑knock warrants?', false, null),
('cj18', 'criminal-justice', 'Should forensic science standards and practices be regulated at the federal level to ensure accuracy?', false, null),
('cj21', 'criminal-justice', 'Should law enforcement agencies be allowed to use DNA databases from genealogy websites to identify suspects?', false, null),
('cj22', 'criminal-justice', 'Should jury duty be voluntary instead of mandatory?', false, null),
('cj24', 'criminal-justice', 'Should the age of criminal responsibility be raised from 18 to 21 for certain non‑violent offenses?', false, null),
-- Technology (missing)
('tech4', 'technology', 'Should law enforcement be able to use facial recognition for surveillance?', false, null),
('tech13', 'technology', 'Should the government fund research into human genetic editing (e.g., CRISPR)?', false, null),
('tech19', 'technology', 'Should the development of lethal autonomous weapons be banned by international treaty?', false, null),
('tech20', 'technology', 'Should the government be allowed to conduct surveillance on citizens without a warrant for national security?', false, null),
-- Healthcare (missing)
('health1', 'healthcare', 'Should the government fund a universal healthcare system?', false, null),
('health2', 'healthcare', 'Should the federal government be allowed to negotiate drug prices with pharmaceutical companies?', false, null),
('health5', 'healthcare', 'Should there be a price cap on the amount patients pay for life-saving drugs like insulin?', false, null),
('health6', 'healthcare', 'Should the U.S. increase funding for mental health research and treatment?', false, null),
('health7', 'healthcare', 'Should undocumented immigrants have access to government-subsidized healthcare?', false, null),
('health10', 'healthcare', 'Should insurance companies be legally barred from denying coverage for pre-existing conditions?', false, null),
('health13', 'healthcare', 'Should the government be able to require citizens to purchase health insurance?', false, null),
('health15', 'healthcare', 'What is your stance on allowing the sale of health insurance across state lines?', false, null),
('health17', 'healthcare', 'Should the FDA''s drug approval process be made faster, even if it carries more risk?', false, null),
-- Environment (missing)
('env1', 'environment', 'Should the government increase environmental regulations to prevent climate change?', false, null),
('env5', 'environment', 'Should the government implement a carbon tax?', false, null),
('env8', 'environment', 'Should the Endangered Species Act (ESA) be strengthened or weakened?', false, null),
('env9', 'environment', 'Should the federal government fund a program to build a national network of electric vehicle (EV) charging stations?', false, null),
('env10', 'environment', 'Should the federal government allow more oil drilling on public lands and offshore?', false, null),
('env11', 'environment', 'Should genetically modified organisms (GMOs) in food require special labeling?', false, null),
-- Economy (missing)
('eco3', 'economy', 'What is your stance on free trade agreements?', false, null),
('eco4', 'economy', 'What is your opinion on labor unions?', false, null),
('eco5', 'economy', 'Should the government implement a Universal Basic Income (UBI)?', false, null),
('eco10', 'economy', 'Should large financial institutions be broken up to prevent another "too big to fail" crisis?', false, null),
('eco15', 'economy', 'Should the inheritance tax (also known as the estate tax or death tax) be abolished?', false, null),
('eco16', 'economy', 'Should insider trading by members of Congress be illegal?', false, null),
('eco17', 'economy', 'Should the corporate tax rate be raised, lowered, or kept the same?', false, null),
('eco20', 'economy', 'Should gig economy workers (e.g., Uber drivers) be classified as employees or independent contractors?', false, null),
('eco26', 'economy', 'What is your stance on "right-to-work" laws, which prevent unions from requiring membership as a condition of employment?', false, null),
('eco27', 'economy', 'Should the government break up large agricultural corporations (agribusiness)?', false, null),
('eco28', 'economy', 'Should the Consumer Financial Protection Bureau (CFPB) have its powers expanded or reduced?', false, null),
('eco30', 'economy', 'What is your stance on increasing taxes on sugary drinks or unhealthy products to fund public health?', false, null),
('eco35', 'economy', 'What is your stance on the use of economic sanctions against authoritarian regimes?', false, null),
('eco38', 'economy', 'What is your stance on "right-to-work" laws?', false, null),
('eco40', 'economy', 'What is your stance on increasing taxes on sugary drinks or other unhealthy products to fund public health initiatives?', false, null),
('eco42', 'economy', 'Should gig economy workers be classified as employees or independent contractors?', false, null),
('eco48', 'economy', 'Should the inheritance (estate) tax be abolished?', false, null),
-- Education (missing)
('edu12', 'education', 'Should tenure for public school teachers be abolished?', false, null),
-- Government Reform (missing)
('gov1', 'government-reform', 'Should there be term limits for Supreme Court justices?', false, null),
('gov2', 'government-reform', 'Should the number of justices on the Supreme Court be changed?', false, null),
('gov4', 'government-reform', 'Should gerrymandering be made illegal through federal law?', false, null),
('gov8', 'government-reform', 'Should the salaries of members of Congress be increased, decreased, or stay the same?', false, null),
('gov10', 'government-reform', 'Should there be a national referendum process to allow citizens to vote directly on certain laws?', false, null),
('gov14', 'government-reform', 'Should the process for amending the U.S. Constitution be made easier?', false, null),
('gov15', 'government-reform', 'Should the federal government be able to set gun control laws that apply to all states?', false, null),
-- Electoral Reform (missing)
('erm3', 'electoral-reform', 'Should the Electoral College be abolished?', false, null),
('erm5', 'electoral-reform', 'Should the U.S. implement automatic voter registration for all eligible citizens?', false, null),
('erm6', 'electoral-reform', 'Should there be term limits for members of Congress?', false, null),
('erm9', 'electoral-reform', 'Should voting by mail be available to all voters in every state?', false, null),
-- Social Issues (missing)
('social9', 'social-issues', 'Should the term "gender identity" be added to anti‑discrimination laws?', false, null),
('social10', 'social-issues', 'Should the government fund Planned Parenthood?', false, null),
('social12', 'social-issues', 'Should the military allow transgender people to serve openly?', false, null),
('social17', 'social-issues', 'Should there be an explicit legal "right to privacy" added to the U.S. Constitution?', false, null),
('social18', 'social-issues', 'What is your stance on abortion policy?', false, null),
('social20', 'social-issues', 'What is your stance on physician‑assisted suicide?', false, null),
('social22', 'social-issues', 'Should the government have a role in regulating content on social media to combat misinformation?', false, null),
('social23', 'social-issues', 'Should the government fund embryonic stem cell research?', false, null),
-- Domestic Policy (missing)
('dp2', 'domestic-policy', 'Should the federal government be primarily responsible for disaster relief?', false, null),
('dp7', 'domestic-policy', 'Should the Transportation Security Administration (TSA) be privatized?', false, null),
('dp8', 'domestic-policy', 'Should the federal government increase funding for the arts and humanities?', false, null),
('dp10', 'domestic-policy', 'Should the federal government have the power to use eminent domain to seize private property for public projects?', false, null),
('dp12', 'domestic-policy', 'Should there be federal regulations on "factory farming" (large-scale animal agriculture)?', false, null),
('dp13', 'domestic-policy', 'Should the federal government have a role in local zoning and land use policy to encourage affordable housing?', false, null),
('dp15', 'domestic-policy', 'Should the federal gas tax be increased to fund highway and infrastructure repairs?', false, null),
('dp17', 'domestic-policy', 'Should the Fairness Doctrine, which required broadcasters to present controversial issues in a balanced way, be reinstated?', false, null),
-- Immigration (missing)
('imm3', 'immigration', 'Should the U.S. provide a pathway to citizenship for undocumented immigrants?', false, null),
('immi4', 'immigration', 'Should the U.S. increase or decrease the number of legal immigrants allowed into the country?', false, null),
('immi5', 'immigration', 'Should the U.S. immigration system prioritize merit and skills over family connections?', false, null),
('immi7', 'immigration', 'Should there be a temporary ban on immigration from certain countries deemed high-risk for terrorism?', false, null),
('immi9', 'immigration', 'Should the number of H-1B visas for skilled foreign workers be increased or decreased?', false, null),
-- Foreign Policy (missing)
('fp1', 'foreign-policy', 'Should the President have authority to launch military strikes without congressional approval?', false, null),
('fp5', 'foreign-policy', 'Should the U.S. increase or decrease military presence in the Indo‑Pacific (e.g., South China Sea)?', false, null),
('fp9', 'foreign-policy', 'Should the U.S. increase or decrease military spending?', false, null),
('fp10', 'foreign-policy', 'Should the President have the authority to launch military strikes without congressional approval?', false, null),
('fp12', 'foreign-policy', 'Should the U.S. increase sanctions on Iran?', false, null),
('fp19', 'foreign-policy', 'Should the U.S. increase, decrease, or maintain its nuclear arsenal?', false, null),
('fp21', 'foreign-policy', 'Should Ukraine be admitted into the NATO military alliance?', false, null),
('fp25', 'foreign-policy', 'Should the U.S. increase, decrease, or maintain its military commitment to NATO?', false, null),
-- China/Taiwan (missing)
('ct3', 'china-taiwan', 'Should the U.S. increase arms sales to Taiwan to bolster its self‑defense capabilities?', false, null),
('ct6', 'china-taiwan', 'Should the U.S. increase or decrease military presence in the South China Sea and surrounding regions?', false, null),
('ct7', 'china-taiwan', 'Should the U.S. impose sanctions on Chinese officials involved in human rights abuses, even if it impacts diplomacy?', false, null),
-- Israel/Palestine (missing)
('ip1', 'israel-palestine', 'Should the U.S. continue to provide military aid to Israel?', false, null),
('ip2', 'israel-palestine', 'Should the U.S. support a two-state solution for Israel and Palestine?', false, null),
('ip4', 'israel-palestine', 'Should the U.S. condition military aid to Israel on human rights considerations?', false, null)
ON CONFLICT (id) DO NOTHING;

-- Now add all answer options for each new question (5 options per question, scores: -10, -5, 0, 5, 10)

-- cj3 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('cj3-1', 'cj3', 'Allow private prisons with performance-based contracts and oversight.', 10, 1),
('cj3-2', 'cj3', 'Prefer performance-based contracts and oversight; avoid bans.', 5, 2),
('cj3-3', 'cj3', 'Phase out where evidence shows worse outcomes; strict contract standards.', 0, 3),
('cj3-4', 'cj3', 'Yes for federal system; tighten contracting and oversight.', -5, 4),
('cj3-5', 'cj3', 'Yes—end private prisons and reduce incarceration overall.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- cj4 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('cj4-1', 'cj4', 'Back the blue; focus on enforcing laws and supporting officers.', 10, 1),
('cj4-2', 'cj4', 'Support training and community policing; oppose anti-police measures.', 5, 2),
('cj4-3', 'cj4', 'Data-driven reforms, transparency, early-warning systems.', 0, 3),
('cj4-4', 'cj4', 'National standards, accountability, training, and community policing.', -5, 4),
('cj4-5', 'cj4', 'Comprehensive reform: accountability, demilitarization, community investment.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- cj5 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('cj5-1', 'cj5', 'Keep cash bail widely in place.', 10, 1),
('cj5-2', 'cj5', 'Reform but keep cash bail for high-risk cases.', 5, 2),
('cj5-3', 'cj5', 'Yes with strong court reminders and victim-safety protocols.', 0, 3),
('cj5-4', 'cj5', 'Yes—move to risk tools and supervision with safeguards.', -5, 4),
('cj5-5', 'cj5', 'Yes—replace with risk-based release; end wealth-based detention.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- cj8 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('cj8-1', 'cj8', 'Oppose federal legalization.', 10, 1),
('cj8-2', 'cj8', 'States decide; allow medical; enforce against trafficking.', 5, 2),
('cj8-3', 'cj8', 'Yes—federal descheduling; regulate like alcohol; tax fairly.', 0, 3),
('cj8-4', 'cj8', 'Yes—deschedule/decriminalize with regulation and expungement.', -5, 4),
('cj8-5', 'cj8', 'Yes—legalize and expunge records.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- cj13 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('cj13-1', 'cj13', 'Support adult trials in many serious cases.', 10, 1),
('cj13-2', 'cj13', 'Allow adult trials for heinous crimes, with judicial discretion.', 5, 2),
('cj13-3', 'cj13', 'Use juvenile courts; allow narrow transfer with safeguards.', 0, 3),
('cj13-4', 'cj13', 'Generally no; rare exceptions with strict review.', -5, 4),
('cj13-5', 'cj13', 'No—use juvenile system with rehabilitation focus.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- cj16 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('cj16-1', 'cj16', 'Strongly support for heinous crimes.', 10, 1),
('cj16-2', 'cj16', 'Allow in the most serious cases with strong due process.', 5, 2),
('cj16-3', 'cj16', 'Moratorium while reviewing innocence/bias concerns.', 0, 3),
('cj16-4', 'cj16', 'Oppose; replace with life without parole.', -5, 4),
('cj16-5', 'cj16', 'No—abolish the death penalty nationwide.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- cj17 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('cj17-1', 'cj17', 'Oppose federal standards; leave to local authorities.', 10, 1),
('cj17-2', 'cj17', 'Prefer local control; no sweeping federal mandates.', 5, 2),
('cj17-3', 'cj17', 'Model national guidance with state implementation and audits.', 0, 3),
('cj17-4', 'cj17', 'Yes—federal standards and funding tied to best practices.', -5, 4),
('cj17-5', 'cj17', 'Yes—strong national limits and accountability.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- cj18 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('cj18-1', 'cj18', 'Oppose federal mandates; leave to states/courts.', 10, 1),
('cj18-2', 'cj18', 'Prefer state standards with federal technical support.', 5, 2),
('cj18-3', 'cj18', 'Yes—national guidelines with independent audits.', 0, 3),
('cj18-4', 'cj18', 'Yes—federal standards and funding for best practices.', -5, 4),
('cj18-5', 'cj18', 'Yes—strict national standards and oversight.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- cj21 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('cj21-1', 'cj21', 'Allow broadly subject to state law; local control.', 10, 1),
('cj21-2', 'cj21', 'Allow under lawful process for serious crimes.', 5, 2),
('cj21-3', 'cj21', 'Permit for serious crimes under strict protocols and audits.', 0, 3),
('cj21-4', 'cj21', 'Allow with warrant, court oversight, and privacy safeguards.', -5, 4),
('cj21-5', 'cj21', 'Allow only with warrant and explicit user consent; strict limits.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- cj22 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('cj22-1', 'cj22', 'Keep mandatory; preserve the jury system.', 10, 1),
('cj22-2', 'cj22', 'Keep mandatory; streamline burdens on citizens/employers.', 5, 2),
('cj22-3', 'cj22', 'Keep mandatory but modernize summons and hardship rules.', 0, 3),
('cj22-4', 'cj22', 'No—maintain mandatory service; improve pay/accommodations.', -5, 4),
('cj22-5', 'cj22', 'No—mandatory civic duty with fair accommodations.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- cj24 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('cj24-1', 'cj24', 'No—adults should face adult consequences.', 10, 1),
('cj24-2', 'cj24', 'No—keep 18; use diversion without changing the age.', 5, 2),
('cj24-3', 'cj24', 'Study outcomes; pilot programs before widespread change.', 0, 3),
('cj24-4', 'cj24', 'Yes for non‑violent offenses with diversion and services.', -5, 4),
('cj24-5', 'cj24', 'Yes—treat young adults more like juveniles for minor crimes.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- tech4 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('tech4-1', 'tech4', 'Allow broad use consistent with state law.', 10, 1),
('tech4-2', 'tech4', 'Allow limited use with accountability; focus on crime reduction.', 5, 2),
('tech4-3', 'tech4', 'Pilot with strict accuracy, bias testing, warrants, and audits.', 0, 3),
('tech4-4', 'tech4', 'Strong limits, warrants, and audits only.', -5, 4),
('tech4-5', 'tech4', 'No—ban or severely limit use; high risk of abuse/bias.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- tech13 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('tech13-1', 'tech13', 'Limit federal funding; rely on private/faith-informed ethics debates.', 10, 1),
('tech13-2', 'tech13', 'Cautious—support research with strict ethics; avoid overregulation.', 5, 2),
('tech13-3', 'tech13', 'Yes—prioritize therapies with transparency and safety.', 0, 3),
('tech13-4', 'tech13', 'Yes—invest in biomedical research with guardrails.', -5, 4),
('tech13-5', 'tech13', 'Yes—fund research with strong ethics oversight.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- tech19 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('tech19-1', 'tech19', 'Oppose international bans that limit U.S. options.', 10, 1),
('tech19-2', 'tech19', 'Skeptical of limits that constrain U.S. advantage.', 5, 2),
('tech19-3', 'tech19', 'Seek norms and verifiable limits; keep human‑in‑the‑loop.', 0, 3),
('tech19-4', 'tech19', 'Pursue treaties/guardrails with allies.', -5, 4),
('tech19-5', 'tech19', 'Yes—global ban on killer robots.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- tech20 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('tech20-1', 'tech20', 'Prioritize security but respect constitutional limits; no mass surveillance.', 10, 1),
('tech20-2', 'tech20', 'Allow targeted surveillance under law; strong oversight.', 5, 2),
('tech20-3', 'tech20', 'No—tighten FISA oversight and auditing; minimize bulk collection.', 0, 3),
('tech20-4', 'tech20', 'No—strengthen privacy and oversight; narrow exceptions only.', -5, 4),
('tech20-5', 'tech20', 'No—Fourth Amendment requires warrants and oversight.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- health1 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('health1-1', 'health1', 'Oppose federal universal systems; return control to states/individuals.', 10, 1),
('health1-2', 'health1', 'No single‑payer; expand private choice/competition and HSAs.', 5, 2),
('health1-3', 'health1', 'Ensure universal access pragmatically—public option/purchasing pools; focus on outcomes.', 0, 3),
('health1-4', 'health1', 'Yes—move toward universal coverage via public option and stronger ACA.', -5, 4),
('health1-5', 'health1', 'Yes—guarantee universal public coverage for all.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- health2 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('health2-1', 'health2', 'Oppose federal price negotiation/caps.', 10, 1),
('health2-2', 'health2', 'Skeptical—encourage competition, PBM reform, faster generics instead of negotiation mandates.', 5, 2),
('health2-3', 'health2', 'Yes—negotiate with reference pricing and generics competition.', 0, 3),
('health2-4', 'health2', 'Yes—negotiate Medicare/Medicaid prices to lower costs.', -5, 4),
('health2-5', 'health2', 'Yes—negotiate and cap prices widely.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- health5 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('health5-1', 'health5', 'No federal price caps.', 10, 1),
('health5-2', 'health5', 'Oppose federal price caps; prefer competition, PBM reform, and transparency.', 5, 2),
('health5-3', 'health5', 'Cap OOP temporarily while increasing competition and biosimilars.', 0, 3),
('health5-4', 'health5', 'Yes—cap costs (e.g., insulin) and expand negotiation.', -5, 4),
('health5-5', 'health5', 'Yes—cap out‑of‑pocket costs and regulate prices.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- health6 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('health6-1', 'health6', 'Prefer state/local leadership and private solutions.', 10, 1),
('health6-2', 'health6', 'Yes—strengthen access with private/public partnerships and telehealth.', 5, 2),
('health6-3', 'health6', 'Yes—outcomes‑based funding and integrated primary care.', 0, 3),
('health6-4', 'health6', 'Yes—expand parity, workforce, and community treatment.', -5, 4),
('health6-5', 'health6', 'Yes—major public investment and parity enforcement.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- health7 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('health7-1', 'health7', 'Oppose subsidized benefits for undocumented immigrants.', 10, 1),
('health7-2', 'health7', 'Limit subsidized benefits; emergency care only as required by law.', 5, 2),
('health7-3', 'health7', 'Provide limited safety‑net coverage (vaccines, emergencies); focus on cost‑effective public health.', 0, 3),
('health7-4', 'health7', 'Expand access for vulnerable groups; ensure public health coverage pathways.', -5, 4),
('health7-5', 'health7', 'Yes—basic coverage and access to care for all residents.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- health10 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('health10-1', 'health10', 'Prefer state jurisdiction over mandates; minimize federal regulation.', 10, 1),
('health10-2', 'health10', 'Support protections paired with state innovation and market reforms.', 5, 2),
('health10-3', 'health10', 'Yes—maintain protections with risk adjustment/reinsurance to keep markets stable.', 0, 3),
('health10-4', 'health10', 'Yes—keep/strengthen ACA protections for pre‑existing conditions.', -5, 4),
('health10-5', 'health10', 'Yes—strong federal protections within universal public coverage.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- health13 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('health13-1', 'health13', 'No federal authority to require purchases.', 10, 1),
('health13-2', 'health13', 'Oppose federal purchase mandates; favor voluntary coverage and competition.', 5, 2),
('health13-3', 'health13', 'Aim for auto‑enrollment/public option and incentives rather than strict mandates.', 0, 3),
('health13-4', 'health13', 'Support mechanisms that ensure broad coverage; open to mandates if necessary.', -5, 4),
('health13-5', 'health13', 'Prefer universal public coverage rather than private purchase mandates.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- health15 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('health15-1', 'health15', 'Favor full interstate deregulation.', 10, 1),
('health15-2', 'health15', 'Support across‑state sales to increase competition and lower premiums.', 5, 2),
('health15-3', 'health15', 'Allow interstate compacts with equal‑or‑better consumer protections.', 0, 3),
('health15-4', 'health15', 'Cautious—maintain consumer protections and essential benefits.', -5, 4),
('health15-5', 'health15', 'Skeptical—focus on public coverage rather than interstate deregulation.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- health17 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('health17-1', 'health17', 'Reduce federal barriers; defer more to physicians/patients.', 10, 1),
('health17-2', 'health17', 'Yes—streamline regulation to speed innovation while protecting safety.', 5, 2),
('health17-3', 'health17', 'Risk‑adjusted approvals for unmet need; rigorous data transparency.', 0, 3),
('health17-4', 'health17', 'Support accelerated pathways with strong post‑market surveillance.', -5, 4),
('health17-5', 'health17', 'Speed with robust safety—no industry capture.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- env1 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('env1-1', 'env1', 'Reduce federal environmental mandates; leave to states/markets.', 10, 1),
('env1-2', 'env1', 'Focus on technology and innovation, not regulations.', 5, 2),
('env1-3', 'env1', 'Yes—cost‑effective rules with measurable results.', 0, 3),
('env1-4', 'env1', 'Yes—tougher rules plus clean‑energy investment.', -5, 4),
('env1-5', 'env1', 'Yes—strict regulations and end fossil fuel subsidies.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- env5 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('env5-1', 'env5', 'No carbon taxes; cut energy taxes/regulation.', 10, 1),
('env5-2', 'env5', 'Skeptical—oppose new energy taxes; focus on innovation.', 5, 2),
('env5-3', 'env5', 'Yes if revenue‑neutral and paired with reliability/competitiveness measures.', 0, 3),
('env5-4', 'env5', 'Open to carbon pricing with rebates and safeguards.', -5, 4),
('env5-5', 'env5', 'Yes—robust carbon pricing alongside strict regulations.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- env8 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('env8-1', 'env8', 'Scale back federal ESA authority; defer to states.', 10, 1),
('env8-2', 'env8', 'Reform ESA to reduce burdens while protecting species.', 5, 2),
('env8-3', 'env8', 'Improve implementation and incentives for private land stewardship.', 0, 3),
('env8-4', 'env8', 'Strengthen/modernize ESA with science and funding.', -5, 4),
('env8-5', 'env8', 'Strengthen ESA protections and habitat recovery.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- env9 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('env9-1', 'env9', 'Oppose federal EV programs.', 10, 1),
('env9-2', 'env9', 'Limit federal spending; rely on private utilities and markets.', 5, 2),
('env9-3', 'env9', 'Yes—co‑fund high‑need corridors with private partners.', 0, 3),
('env9-4', 'env9', 'Yes—federal/state grants and standards to expand charging.', -5, 4),
('env9-5', 'env9', 'Yes—national public charging buildout.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- env10 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('env10-1', 'env10', 'Strongly yes—maximize U.S. drilling onshore/offshore.', 10, 1),
('env10-2', 'env10', 'Yes—expand domestic production with faster permits.', 5, 2),
('env10-3', 'env10', 'Allow limited permits during transition with strong methane/leak rules.', 0, 3),
('env10-4', 'env10', 'Limit and strictly regulate; prioritize clean energy.', -5, 4),
('env10-5', 'env10', 'No—phase out new fossil extraction on public lands.', -10, 5)
ON CONFLICT (id) DO NOTHING;

-- env11 options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
('env11-1', 'env11', 'No federal labeling mandates; state/market choice.', 10, 1),
('env11-2', 'env11', 'Skeptical of new federal mandates; trust FDA safety process.', 5, 2),
('env11-3', 'env11', 'Pilot standardized, QR‑based or digital labels with education.', 0, 3),
('env11-4', 'env11', 'Support transparency and science‑based labeling standards.', -5, 4),
('env11-5', 'env11', 'Yes—clear national right‑to‑know labeling.', -10, 5)
ON CONFLICT (id) DO NOTHING;