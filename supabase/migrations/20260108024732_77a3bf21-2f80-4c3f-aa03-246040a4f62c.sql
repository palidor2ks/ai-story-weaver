-- Update all question options to new standardized format
-- Format: "Yes—because...", "Yes—but...", "Neutral—...", "No—but...", "No—because..."

-- ===========================================
-- IMMIGRATION (i01-i10)
-- ===========================================

-- i01: Should there be a pathway to citizenship for undocumented immigrants?
UPDATE question_options SET text = 'Yes—because citizenship should be accessible.' WHERE question_id = 'i01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but with conditions and waiting periods.' WHERE question_id = 'i01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted legalization paths.' WHERE question_id = 'i01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow legal status without citizenship.' WHERE question_id = 'i01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because legalization rewards lawbreaking.' WHERE question_id = 'i01' AND value = 10 AND is_skip_option = false;

-- i02: Should the U.S. increase border security funding and enforcement?
UPDATE question_options SET text = 'No—because enforcement-only approaches fail.' WHERE question_id = 'i02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but support comprehensive reform.' WHERE question_id = 'i02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance security with reform.' WHERE question_id = 'i02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target effective enforcement.' WHERE question_id = 'i02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because strong borders are essential.' WHERE question_id = 'i02' AND value = 10 AND is_skip_option = false;

-- i03: Should there be a pathway to citizenship for undocumented immigrants? (duplicate question - different context)
UPDATE question_options SET text = 'Yes—because earned citizenship builds society.' WHERE question_id = 'i03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but require community contributions.' WHERE question_id = 'i03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support case-by-case evaluation.' WHERE question_id = 'i03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but permit work authorization.' WHERE question_id = 'i03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because amnesty undermines law.' WHERE question_id = 'i03' AND value = 10 AND is_skip_option = false;

-- i04: Should DACA recipients be granted permanent legal status?
UPDATE question_options SET text = 'Yes—because Dreamers deserve protection.' WHERE question_id = 'i04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but include pathway requirements.' WHERE question_id = 'i04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted protections.' WHERE question_id = 'i04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current DACA status.' WHERE question_id = 'i04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because DACA should end.' WHERE question_id = 'i04' AND value = 10 AND is_skip_option = false;

-- i05: Should the U.S. increase or decrease legal immigration levels?
UPDATE question_options SET text = 'Yes—because immigration strengthens America.' WHERE question_id = 'i05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but increase modestly.' WHERE question_id = 'i05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—maintain current levels.' WHERE question_id = 'i05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but reduce levels somewhat.' WHERE question_id = 'i05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because major reductions are needed.' WHERE question_id = 'i05' AND value = 10 AND is_skip_option = false;

-- i06: Should asylum seekers be allowed to remain in the U.S. while their cases are processed?
UPDATE question_options SET text = 'Yes—because asylum rights must be protected.' WHERE question_id = 'i06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but with monitoring requirements.' WHERE question_id = 'i06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support efficient case processing.' WHERE question_id = 'i06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited exceptions.' WHERE question_id = 'i06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because claims should be processed abroad.' WHERE question_id = 'i06' AND value = 10 AND is_skip_option = false;

-- i07: Should there be a border wall or increased physical barriers?
UPDATE question_options SET text = 'No—because physical barriers are ineffective.' WHERE question_id = 'i07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but support technology-based security.' WHERE question_id = 'i07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted barriers where needed.' WHERE question_id = 'i07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but combine with other security measures.' WHERE question_id = 'i07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because physical barriers are essential.' WHERE question_id = 'i07' AND value = 10 AND is_skip_option = false;

-- i08: Should sanctuary city policies be allowed or prohibited?
UPDATE question_options SET text = 'Yes—because local discretion protects communities.' WHERE question_id = 'i08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but with transparency requirements.' WHERE question_id = 'i08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—allow limited local policies.' WHERE question_id = 'i08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but preserve some local flexibility.' WHERE question_id = 'i08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because sanctuary policies should be banned.' WHERE question_id = 'i08' AND value = 10 AND is_skip_option = false;

-- i09: Should employers face stricter penalties for hiring undocumented workers?
UPDATE question_options SET text = 'No—because enforcement should focus elsewhere.' WHERE question_id = 'i09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but improve verification systems.' WHERE question_id = 'i09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance enforcement with practicality.' WHERE question_id = 'i09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target repeat offenders.' WHERE question_id = 'i09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because strict penalties deter hiring.' WHERE question_id = 'i09' AND value = 10 AND is_skip_option = false;

-- i10: Should family-based immigration be prioritized over employment-based?
UPDATE question_options SET text = 'Yes—because family reunification is essential.' WHERE question_id = 'i10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but balance with skills needs.' WHERE question_id = 'i10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—maintain balanced system.' WHERE question_id = 'i10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep some family categories.' WHERE question_id = 'i10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because merit-based should dominate.' WHERE question_id = 'i10' AND value = 10 AND is_skip_option = false;

-- ===========================================
-- LABOR AND EMPLOYMENT (le01-le10)
-- ===========================================

-- le01: Should the federal minimum wage be increased?
UPDATE question_options SET text = 'Yes—because a living wage should be mandated.' WHERE question_id = 'le01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but phase in gradually.' WHERE question_id = 'le01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest, regional adjustments.' WHERE question_id = 'le01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow state decisions.' WHERE question_id = 'le01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because wages should be market-set.' WHERE question_id = 'le01' AND value = 10 AND is_skip_option = false;

-- le02: Should Congress expand protections for gig-economy workers?
UPDATE question_options SET text = 'Yes—because gig workers should be employees.' WHERE question_id = 'le02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow flexibility.' WHERE question_id = 'le02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance protections and flexibility.' WHERE question_id = 'le02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but encourage voluntary benefits.' WHERE question_id = 'le02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal regulation is unnecessary.' WHERE question_id = 'le02' AND value = 10 AND is_skip_option = false;

-- le03: Should the government strengthen workplace safety regulations?
UPDATE question_options SET text = 'Yes—because safety enforcement should expand.' WHERE question_id = 'le03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-risk industries.' WHERE question_id = 'le03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest improvements.' WHERE question_id = 'le03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current standards.' WHERE question_id = 'le03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because regulations should be reduced.' WHERE question_id = 'le03' AND value = 10 AND is_skip_option = false;

-- le04: Should federal law make it easier to unionize?
UPDATE question_options SET text = 'Yes—because unions should be strengthened.' WHERE question_id = 'le04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but balance with employer rights.' WHERE question_id = 'le04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited reforms.' WHERE question_id = 'le04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current rules.' WHERE question_id = 'le04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because union expansion is harmful.' WHERE question_id = 'le04' AND value = 10 AND is_skip_option = false;

-- le05: Should Congress expand paid sick leave requirements?
UPDATE question_options SET text = 'Yes—because paid sick leave should be mandatory.' WHERE question_id = 'le05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow phased implementation.' WHERE question_id = 'le05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited requirements.' WHERE question_id = 'le05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but encourage voluntary policies.' WHERE question_id = 'le05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because mandates harm employers.' WHERE question_id = 'le05' AND value = 10 AND is_skip_option = false;

-- le06: Should the U.S. increase job training funding?
UPDATE question_options SET text = 'Yes—because training should expand widely.' WHERE question_id = 'le06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-demand skills.' WHERE question_id = 'le06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'le06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'le06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'le06' AND value = 10 AND is_skip_option = false;

-- le07: Should federal policy restrict non-compete agreements?
UPDATE question_options SET text = 'Yes—because most non-competes should be banned.' WHERE question_id = 'le07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow for executives only.' WHERE question_id = 'le07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—restrict in limited cases.' WHERE question_id = 'le07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but ensure transparency.' WHERE question_id = 'le07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because contracts should be enforced.' WHERE question_id = 'le07' AND value = 10 AND is_skip_option = false;

-- le08: Should Congress expand unemployment benefits during recessions?
UPDATE question_options SET text = 'Yes—because benefits should expand automatically.' WHERE question_id = 'le08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target longer downturns.' WHERE question_id = 'le08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansions.' WHERE question_id = 'le08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep benefits limited.' WHERE question_id = 'le08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because expanded benefits discourage work.' WHERE question_id = 'le08' AND value = 10 AND is_skip_option = false;

-- le09: Should the government increase enforcement of wage theft laws?
UPDATE question_options SET text = 'Yes—because enforcement should be strong.' WHERE question_id = 'le09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target major violators.' WHERE question_id = 'le09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'le09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current enforcement.' WHERE question_id = 'le09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because enforcement should be reduced.' WHERE question_id = 'le09' AND value = 10 AND is_skip_option = false;

-- le10: Should federal law require pay transparency?
UPDATE question_options SET text = 'Yes—because transparency should be mandatory.' WHERE question_id = 'le10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow phased adoption.' WHERE question_id = 'le10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited disclosure rules.' WHERE question_id = 'le10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but encourage voluntary transparency.' WHERE question_id = 'le10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because mandates are unnecessary.' WHERE question_id = 'le10' AND value = 10 AND is_skip_option = false;

-- ===========================================
-- LAW (l01-l10)
-- ===========================================

-- l01: Should federal sentencing guidelines be reformed?
UPDATE question_options SET text = 'Yes—because sentencing should be reduced broadly.' WHERE question_id = 'l01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on nonviolent offenses.' WHERE question_id = 'l01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted reforms.' WHERE question_id = 'l01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current guidelines.' WHERE question_id = 'l01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because sentencing should be tougher.' WHERE question_id = 'l01' AND value = 10 AND is_skip_option = false;

-- l02: Should Congress expand legal aid funding for low-income individuals?
UPDATE question_options SET text = 'Yes—because access to counsel should expand.' WHERE question_id = 'l02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target the poorest households.' WHERE question_id = 'l02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'l02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'l02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'l02' AND value = 10 AND is_skip_option = false;

-- l03: Should federal courts be expanded to reduce case backlogs?
UPDATE question_options SET text = 'Yes—because more judgeships are needed.' WHERE question_id = 'l03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but add judges where backlogs are worst.' WHERE question_id = 'l03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest expansion.' WHERE question_id = 'l03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but improve efficiency.' WHERE question_id = 'l03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because expansion is unnecessary.' WHERE question_id = 'l03' AND value = 10 AND is_skip_option = false;

-- l04: Should federal law limit civil asset forfeiture?
UPDATE question_options SET text = 'Yes—because forfeiture should be heavily restricted.' WHERE question_id = 'l04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow for major criminal cases.' WHERE question_id = 'l04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate reforms.' WHERE question_id = 'l04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but add transparency.' WHERE question_id = 'l04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because forfeiture is an effective tool.' WHERE question_id = 'l04' AND value = 10 AND is_skip_option = false;

-- l05: Should Congress strengthen protections for whistleblowers?
UPDATE question_options SET text = 'Yes—because protections should be much stronger.' WHERE question_id = 'l05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target major abuses.' WHERE question_id = 'l05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest improvements.' WHERE question_id = 'l05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rules.' WHERE question_id = 'l05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because protections are sufficient.' WHERE question_id = 'l05' AND value = 10 AND is_skip_option = false;

-- l06: Should the government expand alternative dispute resolution programs?
UPDATE question_options SET text = 'Yes—because ADR should be widely expanded.' WHERE question_id = 'l06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target civil disputes.' WHERE question_id = 'l06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited programs.' WHERE question_id = 'l06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current options.' WHERE question_id = 'l06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because expansion is unnecessary.' WHERE question_id = 'l06' AND value = 10 AND is_skip_option = false;

-- l07: Should federal law reduce pretrial detention for nonviolent offenses?
UPDATE question_options SET text = 'Yes—because detention should be reduced broadly.' WHERE question_id = 'l07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on low-risk cases.' WHERE question_id = 'l07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted reforms.' WHERE question_id = 'l07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited reforms.' WHERE question_id = 'l07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because detention should increase.' WHERE question_id = 'l07' AND value = 10 AND is_skip_option = false;

-- l08: Should Congress increase resources for public defenders?
UPDATE question_options SET text = 'Yes—because defense resources should expand.' WHERE question_id = 'l08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-caseload areas.' WHERE question_id = 'l08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'l08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'l08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'l08' AND value = 10 AND is_skip_option = false;

-- l09: Should federal policy restrict arbitration clauses in consumer contracts?
UPDATE question_options SET text = 'Yes—because forced arbitration should be banned.' WHERE question_id = 'l09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow limited exceptions.' WHERE question_id = 'l09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted restrictions.' WHERE question_id = 'l09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rules.' WHERE question_id = 'l09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because arbitration should remain.' WHERE question_id = 'l09' AND value = 10 AND is_skip_option = false;

-- l10: Should the government expand access to expungement processes?
UPDATE question_options SET text = 'Yes—because expungement should be widely available.' WHERE question_id = 'l10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on nonviolent cases.' WHERE question_id = 'l10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted expansion.' WHERE question_id = 'l10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current access.' WHERE question_id = 'l10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because expungement should be limited.' WHERE question_id = 'l10' AND value = 10 AND is_skip_option = false;

-- ===========================================
-- NATIVE AMERICANS (na01-na10)
-- ===========================================

-- na01: Should Congress expand tribal sovereignty protections?
UPDATE question_options SET text = 'Yes—because sovereignty should be strengthened.' WHERE question_id = 'na01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on key legal gaps.' WHERE question_id = 'na01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited improvements.' WHERE question_id = 'na01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current policy.' WHERE question_id = 'na01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because expansion is unnecessary.' WHERE question_id = 'na01' AND value = 10 AND is_skip_option = false;

-- na02: Should the federal government increase funding for tribal healthcare?
UPDATE question_options SET text = 'Yes—because major funding increases are needed.' WHERE question_id = 'na02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target the most underserved areas.' WHERE question_id = 'na02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'na02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'na02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'na02' AND value = 10 AND is_skip_option = false;

-- na03: Should the U.S. expand support for tribal education programs?
UPDATE question_options SET text = 'Yes—because education funding should expand.' WHERE question_id = 'na03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target critical programs.' WHERE question_id = 'na03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'na03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current support.' WHERE question_id = 'na03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal support should shrink.' WHERE question_id = 'na03' AND value = 10 AND is_skip_option = false;

-- na04: Should Congress strengthen protections for sacred sites?
UPDATE question_options SET text = 'Yes—because sacred sites need strong protection.' WHERE question_id = 'na04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on high-risk sites.' WHERE question_id = 'na04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted protections.' WHERE question_id = 'na04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current protections.' WHERE question_id = 'na04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because restrictions should be reduced.' WHERE question_id = 'na04' AND value = 10 AND is_skip_option = false;

-- na05: Should federal law expand tribal law enforcement authority?
UPDATE question_options SET text = 'Yes—because authority should expand broadly.' WHERE question_id = 'na05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but pair with resources and oversight.' WHERE question_id = 'na05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'na05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current authority.' WHERE question_id = 'na05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because expansion is unnecessary.' WHERE question_id = 'na05' AND value = 10 AND is_skip_option = false;

-- na06: Should the government increase housing assistance for tribal communities?
UPDATE question_options SET text = 'Yes—because housing support should expand.' WHERE question_id = 'na06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target highest-need areas.' WHERE question_id = 'na06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited increases.' WHERE question_id = 'na06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current assistance.' WHERE question_id = 'na06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because assistance should be reduced.' WHERE question_id = 'na06' AND value = 10 AND is_skip_option = false;

-- na07: Should federal agencies prioritize tribal consultation in policy decisions?
UPDATE question_options SET text = 'Yes—because consultation should be mandatory.' WHERE question_id = 'na07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on high-impact policies.' WHERE question_id = 'na07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted consultation.' WHERE question_id = 'na07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current practice.' WHERE question_id = 'na07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because additional requirements are unnecessary.' WHERE question_id = 'na07' AND value = 10 AND is_skip_option = false;

-- na08: Should Congress expand economic development grants for tribes?
UPDATE question_options SET text = 'Yes—because economic support should expand.' WHERE question_id = 'na08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target critical development needs.' WHERE question_id = 'na08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'na08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current grants.' WHERE question_id = 'na08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because grants should be reduced.' WHERE question_id = 'na08' AND value = 10 AND is_skip_option = false;

-- na09: Should the U.S. increase funding for tribal infrastructure?
UPDATE question_options SET text = 'Yes—because infrastructure needs major investment.' WHERE question_id = 'na09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on highest-need projects.' WHERE question_id = 'na09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'na09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'na09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'na09' AND value = 10 AND is_skip_option = false;

-- na10: Should federal law strengthen protections for Native languages?
UPDATE question_options SET text = 'Yes—because language preservation should expand.' WHERE question_id = 'na10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on endangered languages.' WHERE question_id = 'na10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted programs.' WHERE question_id = 'na10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current support.' WHERE question_id = 'na10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because protections are sufficient.' WHERE question_id = 'na10' AND value = 10 AND is_skip_option = false;

-- ===========================================
-- INTERNATIONAL AFFAIRS (ia01-ia10)
-- ===========================================

-- ia01: Should the U.S. increase foreign aid spending?
UPDATE question_options SET text = 'Yes—because aid should expand significantly.' WHERE question_id = 'ia01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target strategic humanitarian needs.' WHERE question_id = 'ia01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'ia01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current levels.' WHERE question_id = 'ia01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because aid should be reduced.' WHERE question_id = 'ia01' AND value = 10 AND is_skip_option = false;

-- ia02: Should Congress limit arms sales to certain countries?
UPDATE question_options SET text = 'Yes—because arms sales should be restricted.' WHERE question_id = 'ia02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but limit only high-risk recipients.' WHERE question_id = 'ia02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted restrictions.' WHERE question_id = 'ia02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current policy.' WHERE question_id = 'ia02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because sales should expand.' WHERE question_id = 'ia02' AND value = 10 AND is_skip_option = false;

-- ia03: Should the U.S. expand diplomatic engagement with adversaries?
UPDATE question_options SET text = 'Yes—because diplomacy should be prioritized.' WHERE question_id = 'ia03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep strong safeguards.' WHERE question_id = 'ia03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—engage selectively.' WHERE question_id = 'ia03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited dialogue.' WHERE question_id = 'ia03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because engagement weakens leverage.' WHERE question_id = 'ia03' AND value = 10 AND is_skip_option = false;

-- ia04: Should federal policy prioritize democracy promotion abroad?
UPDATE question_options SET text = 'Yes—because democracy promotion is essential.' WHERE question_id = 'ia04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but balance with strategic interests.' WHERE question_id = 'ia04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted programs.' WHERE question_id = 'ia04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain limited programs.' WHERE question_id = 'ia04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because domestic interests should dominate.' WHERE question_id = 'ia04' AND value = 10 AND is_skip_option = false;

-- ia05: Should the U.S. increase sanctions against human rights violators?
UPDATE question_options SET text = 'Yes—because strong sanctions deter abuse.' WHERE question_id = 'ia05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target major offenders.' WHERE question_id = 'ia05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—use sanctions selectively.' WHERE question_id = 'ia05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current levels.' WHERE question_id = 'ia05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because sanctions should be reduced.' WHERE question_id = 'ia05' AND value = 10 AND is_skip_option = false;

-- ia06: Should Congress expand funding for global health initiatives?
UPDATE question_options SET text = 'Yes—because global health funding should grow.' WHERE question_id = 'ia06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but prioritize high-impact programs.' WHERE question_id = 'ia06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'ia06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'ia06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'ia06' AND value = 10 AND is_skip_option = false;

-- ia07: Should the government prioritize alliances in foreign policy?
UPDATE question_options SET text = 'Yes—because alliances are essential.' WHERE question_id = 'ia07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but require shared responsibilities.' WHERE question_id = 'ia07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance alliances with national interests.' WHERE question_id = 'ia07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain key alliances.' WHERE question_id = 'ia07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because U.S. independence should dominate.' WHERE question_id = 'ia07' AND value = 10 AND is_skip_option = false;

-- ia08: Should the U.S. reduce involvement in foreign conflicts?
UPDATE question_options SET text = 'Yes—because military involvement should end.' WHERE question_id = 'ia08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but maintain key strategic positions.' WHERE question_id = 'ia08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—evaluate each conflict individually.' WHERE question_id = 'ia08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but be more selective.' WHERE question_id = 'ia08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because engagement protects interests.' WHERE question_id = 'ia08' AND value = 10 AND is_skip_option = false;

-- ia09: Should Congress expand funding for humanitarian relief?
UPDATE question_options SET text = 'Yes—because humanitarian aid should expand.' WHERE question_id = 'ia09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target urgent crises.' WHERE question_id = 'ia09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'ia09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'ia09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'ia09' AND value = 10 AND is_skip_option = false;

-- ia10: Should the U.S. rejoin or strengthen international agreements?
UPDATE question_options SET text = 'Yes—because global agreements should expand.' WHERE question_id = 'ia10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on key agreements.' WHERE question_id = 'ia10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—participate selectively.' WHERE question_id = 'ia10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep limited agreements.' WHERE question_id = 'ia10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because agreements limit sovereignty.' WHERE question_id = 'ia10' AND value = 10 AND is_skip_option = false;