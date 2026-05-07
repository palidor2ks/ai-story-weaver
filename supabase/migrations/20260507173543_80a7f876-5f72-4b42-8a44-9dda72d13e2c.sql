-- Convert local question options from Agree/Disagree to Yes/No format
-- Updates 500 option texts across 100 local questions (5 topics)

-- local-col-1: Should the state or city set a minimum wage above the federal level?
UPDATE question_options SET text = 'Yes—because workers need a living wage tied to local costs.' WHERE id = 'local-col-1-opt-1';
UPDATE question_options SET text = 'Yes—but only modest increases above the federal floor.' WHERE id = 'local-col-1-opt-2';
UPDATE question_options SET text = 'Neutral—maintain the current state approach.' WHERE id = 'local-col-1-opt-3';
UPDATE question_options SET text = 'No—but allow cities to opt in voluntarily.' WHERE id = 'local-col-1-opt-4';
UPDATE question_options SET text = 'No—because minimum wage should be set federally only.' WHERE id = 'local-col-1-opt-5';

-- local-col-10: Should the state regulate prescription drug prices at the local level?
UPDATE question_options SET text = 'Yes—because residents need protection from price gouging on medication.' WHERE id = 'local-col-10-opt-1';
UPDATE question_options SET text = 'Yes—but focus on the most essential drugs only.' WHERE id = 'local-col-10-opt-2';
UPDATE question_options SET text = 'Neutral—support studying the impact of price regulation first.' WHERE id = 'local-col-10-opt-3';
UPDATE question_options SET text = 'No—but encourage bulk purchasing programs for savings.' WHERE id = 'local-col-10-opt-4';
UPDATE question_options SET text = 'No—because drug pricing should be handled at the federal level.' WHERE id = 'local-col-10-opt-5';

-- local-col-11: Should local governments offer cost-of-living adjustments for public employees?
UPDATE question_options SET text = 'Yes—because public employees deserve wages that keep up with inflation.' WHERE id = 'local-col-11-opt-1';
UPDATE question_options SET text = 'Yes—but tie adjustments to measurable local cost indexes.' WHERE id = 'local-col-11-opt-2';
UPDATE question_options SET text = 'Neutral—review current compensation before making changes.' WHERE id = 'local-col-11-opt-3';
UPDATE question_options SET text = 'No—but offer performance-based pay increases instead.' WHERE id = 'local-col-11-opt-4';
UPDATE question_options SET text = 'No—because public employee wages should be set through negotiation.' WHERE id = 'local-col-11-opt-5';

-- local-col-12: Should the state fund energy assistance programs for low-income households?
UPDATE question_options SET text = 'Yes—because energy is a basic necessity no family should go without.' WHERE id = 'local-col-12-opt-1';
UPDATE question_options SET text = 'Yes—but focus on the most vulnerable populations.' WHERE id = 'local-col-12-opt-2';
UPDATE question_options SET text = 'Neutral—support evaluating current program effectiveness.' WHERE id = 'local-col-12-opt-3';
UPDATE question_options SET text = 'No—but encourage energy efficiency upgrades instead.' WHERE id = 'local-col-12-opt-4';
UPDATE question_options SET text = 'No—because energy costs should be handled by the private market.' WHERE id = 'local-col-12-opt-5';

-- local-col-13: Should local governments regulate parking fees and tolls?
UPDATE question_options SET text = 'Yes—because high parking and toll costs burden daily commuters.' WHERE id = 'local-col-13-opt-1';
UPDATE question_options SET text = 'Yes—but only in areas with limited alternatives.' WHERE id = 'local-col-13-opt-2';
UPDATE question_options SET text = 'Neutral—review whether current fees are reasonable.' WHERE id = 'local-col-13-opt-3';
UPDATE question_options SET text = 'No—but increase transparency in how fees are set.' WHERE id = 'local-col-13-opt-4';
UPDATE question_options SET text = 'No—because parking and toll fees should reflect market demand.' WHERE id = 'local-col-13-opt-5';

-- local-col-14: Should the state expand earned income tax credits?
UPDATE question_options SET text = 'Yes—because EITCs effectively lift working families out of poverty.' WHERE id = 'local-col-14-opt-1';
UPDATE question_options SET text = 'Yes—but with income caps to target those most in need.' WHERE id = 'local-col-14-opt-2';
UPDATE question_options SET text = 'Neutral—evaluate the fiscal impact before expanding.' WHERE id = 'local-col-14-opt-3';
UPDATE question_options SET text = 'No—but simplify existing credits to improve participation.' WHERE id = 'local-col-14-opt-4';
UPDATE question_options SET text = 'No—because tax credits create dependency and fiscal burdens.' WHERE id = 'local-col-14-opt-5';

-- local-col-15: Should local governments subsidize internet access for low-income residents?
UPDATE question_options SET text = 'Yes—because internet is essential infrastructure for everyone.' WHERE id = 'local-col-15-opt-1';
UPDATE question_options SET text = 'Yes—but target only the most underserved areas.' WHERE id = 'local-col-15-opt-2';
UPDATE question_options SET text = 'Neutral—support limited pilot programs first.' WHERE id = 'local-col-15-opt-3';
UPDATE question_options SET text = 'No—but encourage private-sector discount programs.' WHERE id = 'local-col-15-opt-4';
UPDATE question_options SET text = 'No—because internet access should be market-driven.' WHERE id = 'local-col-15-opt-5';

-- local-col-16: Should the state cap annual rent increases?
UPDATE question_options SET text = 'Yes—because tenants need protection from price gouging.' WHERE id = 'local-col-16-opt-1';
UPDATE question_options SET text = 'Yes—but with reasonable limits that still allow market adjustments.' WHERE id = 'local-col-16-opt-2';
UPDATE question_options SET text = 'Neutral—support studying the issue before acting.' WHERE id = 'local-col-16-opt-3';
UPDATE question_options SET text = 'No—but encourage voluntary landlord restraint.' WHERE id = 'local-col-16-opt-4';
UPDATE question_options SET text = 'No—because rent control distorts the housing market.' WHERE id = 'local-col-16-opt-5';

-- local-col-17: Should local governments provide free or reduced school supplies?
UPDATE question_options SET text = 'Yes—because no child should lack supplies due to family income.' WHERE id = 'local-col-17-opt-1';
UPDATE question_options SET text = 'Yes—but limit to families below the poverty line.' WHERE id = 'local-col-17-opt-2';
UPDATE question_options SET text = 'Neutral—support evaluating current assistance programs.' WHERE id = 'local-col-17-opt-3';
UPDATE question_options SET text = 'No—but partner with nonprofits for supply drives.' WHERE id = 'local-col-17-opt-4';
UPDATE question_options SET text = 'No—because school supplies are a family responsibility.' WHERE id = 'local-col-17-opt-5';

-- local-col-18: Should the state lower vehicle registration fees?
UPDATE question_options SET text = 'Yes—because high fees are a burden on everyday drivers.' WHERE id = 'local-col-18-opt-1';
UPDATE question_options SET text = 'Yes—but only for low-income vehicle owners.' WHERE id = 'local-col-18-opt-2';
UPDATE question_options SET text = 'Neutral—review whether fees match actual administrative costs.' WHERE id = 'local-col-18-opt-3';
UPDATE question_options SET text = 'No—but ensure fees fund road maintenance effectively.' WHERE id = 'local-col-18-opt-4';
UPDATE question_options SET text = 'No—because registration fees fund essential services.' WHERE id = 'local-col-18-opt-5';

-- local-col-19: Should local governments offer small business tax incentives to reduce consumer prices?
UPDATE question_options SET text = 'Yes—because supporting small businesses benefits the whole community.' WHERE id = 'local-col-19-opt-1';
UPDATE question_options SET text = 'Yes—but only for businesses in underserved areas.' WHERE id = 'local-col-19-opt-2';
UPDATE question_options SET text = 'Neutral—evaluate whether incentives actually lower prices.' WHERE id = 'local-col-19-opt-3';
UPDATE question_options SET text = 'No—but reduce overall business tax rates instead.' WHERE id = 'local-col-19-opt-4';
UPDATE question_options SET text = 'No—because tax incentives distort free market competition.' WHERE id = 'local-col-19-opt-5';

-- local-col-2: Should local governments regulate utility rates to keep them affordable?
UPDATE question_options SET text = 'Yes—because affordable utilities are essential for all residents.' WHERE id = 'local-col-2-opt-1';
UPDATE question_options SET text = 'Yes—but with limits to avoid discouraging investment.' WHERE id = 'local-col-2-opt-2';
UPDATE question_options SET text = 'Neutral—support review of current rate structures.' WHERE id = 'local-col-2-opt-3';
UPDATE question_options SET text = 'No—but encourage voluntary rate relief programs.' WHERE id = 'local-col-2-opt-4';
UPDATE question_options SET text = 'No—because utility rates should be market-driven.' WHERE id = 'local-col-2-opt-5';

-- local-col-20: Should the state invest in programs to reduce healthcare costs for residents?
UPDATE question_options SET text = 'Yes—because healthcare costs are a crisis for working families.' WHERE id = 'local-col-20-opt-1';
UPDATE question_options SET text = 'Yes—but focus on preventive care and generic drug access.' WHERE id = 'local-col-20-opt-2';
UPDATE question_options SET text = 'Neutral—support studying cost drivers before investing.' WHERE id = 'local-col-20-opt-3';
UPDATE question_options SET text = 'No—but remove regulatory barriers to increase competition.' WHERE id = 'local-col-20-opt-4';
UPDATE question_options SET text = 'No—because healthcare costs should be addressed by the free market.' WHERE id = 'local-col-20-opt-5';

-- local-col-3: Should the state expand subsidized childcare programs?
UPDATE question_options SET text = 'Yes—because affordable childcare is critical for working families.' WHERE id = 'local-col-3-opt-1';
UPDATE question_options SET text = 'Yes—but target subsidies to the lowest-income families.' WHERE id = 'local-col-3-opt-2';
UPDATE question_options SET text = 'Neutral—support studying the best approach first.' WHERE id = 'local-col-3-opt-3';
UPDATE question_options SET text = 'No—but offer tax credits for childcare expenses instead.' WHERE id = 'local-col-3-opt-4';
UPDATE question_options SET text = 'No—because childcare should be a private responsibility.' WHERE id = 'local-col-3-opt-5';

-- local-col-4: Should groceries be exempt from state and local sales tax?
UPDATE question_options SET text = 'Yes—because taxing food burdens low-income families the most.' WHERE id = 'local-col-4-opt-1';
UPDATE question_options SET text = 'Yes—but only for basic staples, not luxury food items.' WHERE id = 'local-col-4-opt-2';
UPDATE question_options SET text = 'Neutral—evaluate the fiscal impact before deciding.' WHERE id = 'local-col-4-opt-3';
UPDATE question_options SET text = 'No—but offer targeted rebates for low-income households.' WHERE id = 'local-col-4-opt-4';
UPDATE question_options SET text = 'No—because sales tax should apply uniformly to all goods.' WHERE id = 'local-col-4-opt-5';

-- local-col-5: Should the state reduce or cap gas taxes?
UPDATE question_options SET text = 'Yes—because high gas prices hurt working families and commuters.' WHERE id = 'local-col-5-opt-1';
UPDATE question_options SET text = 'Yes—but only temporarily during price spikes.' WHERE id = 'local-col-5-opt-2';
UPDATE question_options SET text = 'Neutral—review whether current rates are appropriate.' WHERE id = 'local-col-5-opt-3';
UPDATE question_options SET text = 'No—but earmark revenue for road infrastructure.' WHERE id = 'local-col-5-opt-4';
UPDATE question_options SET text = 'No—because gas taxes fund essential transportation needs.' WHERE id = 'local-col-5-opt-5';

-- local-col-6: Should property tax relief programs be expanded for low-income residents?
UPDATE question_options SET text = 'Yes—because rising property taxes push people out of their homes.' WHERE id = 'local-col-6-opt-1';
UPDATE question_options SET text = 'Yes—but limit relief to seniors and fixed-income households.' WHERE id = 'local-col-6-opt-2';
UPDATE question_options SET text = 'Neutral—support reviewing current relief programs first.' WHERE id = 'local-col-6-opt-3';
UPDATE question_options SET text = 'No—but simplify the application process for existing programs.' WHERE id = 'local-col-6-opt-4';
UPDATE question_options SET text = 'No—because property taxes should apply equally to all owners.' WHERE id = 'local-col-6-opt-5';

-- local-col-7: Should public transit be made more affordable or free?
UPDATE question_options SET text = 'Yes—because public transit is essential infrastructure for everyone.' WHERE id = 'local-col-7-opt-1';
UPDATE question_options SET text = 'Yes—but only for low-income riders and students.' WHERE id = 'local-col-7-opt-2';
UPDATE question_options SET text = 'Neutral—support studying ridership and funding impacts.' WHERE id = 'local-col-7-opt-3';
UPDATE question_options SET text = 'No—but improve service quality to justify current fares.' WHERE id = 'local-col-7-opt-4';
UPDATE question_options SET text = 'No—because riders should pay the cost of the service.' WHERE id = 'local-col-7-opt-5';

-- local-col-8: Should the state provide tax credits for working families?
UPDATE question_options SET text = 'Yes—because working families need financial relief to get ahead.' WHERE id = 'local-col-8-opt-1';
UPDATE question_options SET text = 'Yes—but target credits to families below the median income.' WHERE id = 'local-col-8-opt-2';
UPDATE question_options SET text = 'Neutral—evaluate effectiveness of existing tax credits first.' WHERE id = 'local-col-8-opt-3';
UPDATE question_options SET text = 'No—but reduce overall tax rates instead.' WHERE id = 'local-col-8-opt-4';
UPDATE question_options SET text = 'No—because targeted credits distort the tax code.' WHERE id = 'local-col-8-opt-5';

-- local-col-9: Should local governments cap fees for essential services like water and sewer?
UPDATE question_options SET text = 'Yes—because essential services should be affordable for everyone.' WHERE id = 'local-col-9-opt-1';
UPDATE question_options SET text = 'Yes—but allow adjustments for infrastructure maintenance costs.' WHERE id = 'local-col-9-opt-2';
UPDATE question_options SET text = 'Neutral—support reviewing fee structures for fairness.' WHERE id = 'local-col-9-opt-3';
UPDATE question_options SET text = 'No—but require transparent fee-setting processes.' WHERE id = 'local-col-9-opt-4';
UPDATE question_options SET text = 'No—because fees should reflect the true cost of service delivery.' WHERE id = 'local-col-9-opt-5';

-- local-edu-1: Should the state increase funding for public K-12 schools?
UPDATE question_options SET text = 'Yes—because public schools need major investment to succeed.' WHERE id = 'local-edu-1-opt-1';
UPDATE question_options SET text = 'Yes—but target funding to underfunded districts.' WHERE id = 'local-edu-1-opt-2';
UPDATE question_options SET text = 'Neutral—support reviewing current funding distribution first.' WHERE id = 'local-edu-1-opt-3';
UPDATE question_options SET text = 'No—but improve efficiency in current spending.' WHERE id = 'local-edu-1-opt-4';
UPDATE question_options SET text = 'No—because education funding should not keep increasing.' WHERE id = 'local-edu-1-opt-5';

-- local-edu-10: Should parents have the right to opt their children out of specific curricula?
UPDATE question_options SET text = 'Yes—because parents should have the final say in their child''s education.' WHERE id = 'local-edu-10-opt-1';
UPDATE question_options SET text = 'Yes—but only for non-core subjects and with alternative assignments.' WHERE id = 'local-edu-10-opt-2';
UPDATE question_options SET text = 'Neutral—support case-by-case review of opt-out requests.' WHERE id = 'local-edu-10-opt-3';
UPDATE question_options SET text = 'No—but increase transparency about curriculum content.' WHERE id = 'local-edu-10-opt-4';
UPDATE question_options SET text = 'No—because all students should learn the full approved curriculum.' WHERE id = 'local-edu-10-opt-5';

-- local-edu-11: Should the state invest more in vocational and trade school programs?
UPDATE question_options SET text = 'Yes—because trade careers are vital and deserve equal investment.' WHERE id = 'local-edu-11-opt-1';
UPDATE question_options SET text = 'Yes—but align programs with local workforce needs.' WHERE id = 'local-edu-11-opt-2';
UPDATE question_options SET text = 'Neutral—support evaluating demand before expanding.' WHERE id = 'local-edu-11-opt-3';
UPDATE question_options SET text = 'No—but encourage private-sector apprenticeship partnerships.' WHERE id = 'local-edu-11-opt-4';
UPDATE question_options SET text = 'No—because vocational training should be industry-funded.' WHERE id = 'local-edu-11-opt-5';

-- local-edu-12: Should local school districts have more control over hiring and firing teachers?
UPDATE question_options SET text = 'Yes—because districts know their staffing needs best.' WHERE id = 'local-edu-12-opt-1';
UPDATE question_options SET text = 'Yes—but maintain basic protections against unfair dismissal.' WHERE id = 'local-edu-12-opt-2';
UPDATE question_options SET text = 'Neutral—support a balanced approach to local flexibility.' WHERE id = 'local-edu-12-opt-3';
UPDATE question_options SET text = 'No—but streamline existing procedures for accountability.' WHERE id = 'local-edu-12-opt-4';
UPDATE question_options SET text = 'No—because statewide standards protect teacher rights.' WHERE id = 'local-edu-12-opt-5';

-- local-edu-13: Should the state mandate smaller class sizes in public schools?
UPDATE question_options SET text = 'Yes—because smaller classes improve learning outcomes significantly.' WHERE id = 'local-edu-13-opt-1';
UPDATE question_options SET text = 'Yes—but focus on early grades where impact is greatest.' WHERE id = 'local-edu-13-opt-2';
UPDATE question_options SET text = 'Neutral—support studying the cost-benefit tradeoff first.' WHERE id = 'local-edu-13-opt-3';
UPDATE question_options SET text = 'No—but invest in teacher aides and support staff instead.' WHERE id = 'local-edu-13-opt-4';
UPDATE question_options SET text = 'No—because class size mandates are costly and inflexible.' WHERE id = 'local-edu-13-opt-5';

-- local-edu-14: Should public school funding be tied to property taxes?
UPDATE question_options SET text = 'Yes—because local investment in schools reflects community priorities.' WHERE id = 'local-edu-14-opt-1';
UPDATE question_options SET text = 'Yes—but with state equalization funds for poorer districts.' WHERE id = 'local-edu-14-opt-2';
UPDATE question_options SET text = 'Neutral—support reviewing alternative funding models.' WHERE id = 'local-edu-14-opt-3';
UPDATE question_options SET text = 'No—but phase in changes gradually to avoid disruption.' WHERE id = 'local-edu-14-opt-4';
UPDATE question_options SET text = 'No—because property tax funding creates unequal opportunities.' WHERE id = 'local-edu-14-opt-5';

-- local-edu-15: Should the state increase funding for school safety and security measures?
UPDATE question_options SET text = 'Yes—because student safety must be the top priority.' WHERE id = 'local-edu-15-opt-1';
UPDATE question_options SET text = 'Yes—but focus on counselors and prevention over hardware.' WHERE id = 'local-edu-15-opt-2';
UPDATE question_options SET text = 'Neutral—support assessing current security gaps first.' WHERE id = 'local-edu-15-opt-3';
UPDATE question_options SET text = 'No—but improve coordination with local law enforcement.' WHERE id = 'local-edu-15-opt-4';
UPDATE question_options SET text = 'No—because current safety measures are adequate.' WHERE id = 'local-edu-15-opt-5';

-- local-edu-16: Should after-school programs receive more public funding?
UPDATE question_options SET text = 'Yes—because after-school programs keep kids safe and engaged.' WHERE id = 'local-edu-16-opt-1';
UPDATE question_options SET text = 'Yes—but prioritize programs in high-need communities.' WHERE id = 'local-edu-16-opt-2';
UPDATE question_options SET text = 'Neutral—support evaluating program effectiveness first.' WHERE id = 'local-edu-16-opt-3';
UPDATE question_options SET text = 'No—but encourage community and nonprofit partnerships.' WHERE id = 'local-edu-16-opt-4';
UPDATE question_options SET text = 'No—because after-school activities are a family responsibility.' WHERE id = 'local-edu-16-opt-5';

-- local-edu-17: Should the state fund free community college tuition?
UPDATE question_options SET text = 'Yes—because higher education should be accessible to everyone.' WHERE id = 'local-edu-17-opt-1';
UPDATE question_options SET text = 'Yes—but limit to in-demand career programs.' WHERE id = 'local-edu-17-opt-2';
UPDATE question_options SET text = 'Neutral—support pilot programs before full implementation.' WHERE id = 'local-edu-17-opt-3';
UPDATE question_options SET text = 'No—but expand financial aid for low-income students.' WHERE id = 'local-edu-17-opt-4';
UPDATE question_options SET text = 'No—because tuition costs should be borne by the student.' WHERE id = 'local-edu-17-opt-5';

-- local-edu-18: Should public schools be required to teach financial literacy?
UPDATE question_options SET text = 'Yes—because financial skills are essential for every student''s future.' WHERE id = 'local-edu-18-opt-1';
UPDATE question_options SET text = 'Yes—but integrate it into existing coursework rather than adding classes.' WHERE id = 'local-edu-18-opt-2';
UPDATE question_options SET text = 'Neutral—support reviewing what curriculum space is available.' WHERE id = 'local-edu-18-opt-3';
UPDATE question_options SET text = 'No—but make it an optional elective.' WHERE id = 'local-edu-18-opt-4';
UPDATE question_options SET text = 'No—because financial education is a family responsibility.' WHERE id = 'local-edu-18-opt-5';

-- local-edu-19: Should the state expand bilingual education programs?
UPDATE question_options SET text = 'Yes—because bilingual education helps all students succeed.' WHERE id = 'local-edu-19-opt-1';
UPDATE question_options SET text = 'Yes—but focus on communities with the highest demand.' WHERE id = 'local-edu-19-opt-2';
UPDATE question_options SET text = 'Neutral—support evaluating outcomes of current programs.' WHERE id = 'local-edu-19-opt-3';
UPDATE question_options SET text = 'No—but ensure strong English-language instruction for all.' WHERE id = 'local-edu-19-opt-4';
UPDATE question_options SET text = 'No—because instruction should be in English only.' WHERE id = 'local-edu-19-opt-5';

-- local-edu-2: Should charter schools receive public funding?
UPDATE question_options SET text = 'Yes—because parents deserve educational choices for their children.' WHERE id = 'local-edu-2-opt-1';
UPDATE question_options SET text = 'Yes—but with strict accountability and performance standards.' WHERE id = 'local-edu-2-opt-2';
UPDATE question_options SET text = 'Neutral—support studying charter school outcomes first.' WHERE id = 'local-edu-2-opt-3';
UPDATE question_options SET text = 'No—but allow charters to operate without public funding.' WHERE id = 'local-edu-2-opt-4';
UPDATE question_options SET text = 'No—because public funds should go only to public schools.' WHERE id = 'local-edu-2-opt-5';

-- local-edu-20: Should local governments have authority to set school calendar schedules?
UPDATE question_options SET text = 'Yes—because local communities know their scheduling needs best.' WHERE id = 'local-edu-20-opt-1';
UPDATE question_options SET text = 'Yes—but within broad state-defined parameters.' WHERE id = 'local-edu-20-opt-2';
UPDATE question_options SET text = 'Neutral—support flexibility with some statewide coordination.' WHERE id = 'local-edu-20-opt-3';
UPDATE question_options SET text = 'No—but allow limited modifications for local events.' WHERE id = 'local-edu-20-opt-4';
UPDATE question_options SET text = 'No—because a uniform calendar ensures statewide consistency.' WHERE id = 'local-edu-20-opt-5';

-- local-edu-3: Should teacher salaries be increased to attract and retain qualified educators?
UPDATE question_options SET text = 'Yes—because competitive pay is essential to attract quality teachers.' WHERE id = 'local-edu-3-opt-1';
UPDATE question_options SET text = 'Yes—but tie increases to performance and retention goals.' WHERE id = 'local-edu-3-opt-2';
UPDATE question_options SET text = 'Neutral—support reviewing compensation against comparable careers.' WHERE id = 'local-edu-3-opt-3';
UPDATE question_options SET text = 'No—but improve working conditions and benefits instead.' WHERE id = 'local-edu-3-opt-4';
UPDATE question_options SET text = 'No—because teacher pay should be set by local market conditions.' WHERE id = 'local-edu-3-opt-5';

-- local-edu-4: Should school boards have more authority over curriculum decisions?
UPDATE question_options SET text = 'Yes—because local communities should shape their children''s education.' WHERE id = 'local-edu-4-opt-1';
UPDATE question_options SET text = 'Yes—but within state-established academic standards.' WHERE id = 'local-edu-4-opt-2';
UPDATE question_options SET text = 'Neutral—support a balance between state and local authority.' WHERE id = 'local-edu-4-opt-3';
UPDATE question_options SET text = 'No—but allow some flexibility for local priorities.' WHERE id = 'local-edu-4-opt-4';
UPDATE question_options SET text = 'No—because curriculum standards should be set at the state level.' WHERE id = 'local-edu-4-opt-5';

-- local-edu-5: Should the state expand school choice voucher programs?
UPDATE question_options SET text = 'Yes—because families should pick the best school for their children.' WHERE id = 'local-edu-5-opt-1';
UPDATE question_options SET text = 'Yes—but limit vouchers to low-income families.' WHERE id = 'local-edu-5-opt-2';
UPDATE question_options SET text = 'Neutral—support pilot programs to evaluate effectiveness.' WHERE id = 'local-edu-5-opt-3';
UPDATE question_options SET text = 'No—but improve public school options instead.' WHERE id = 'local-edu-5-opt-4';
UPDATE question_options SET text = 'No—because vouchers divert resources from public schools.' WHERE id = 'local-edu-5-opt-5';

-- local-edu-6: Should special education funding be increased at the state level?
UPDATE question_options SET text = 'Yes—because every child deserves adequate support regardless of ability.' WHERE id = 'local-edu-6-opt-1';
UPDATE question_options SET text = 'Yes—but with better accountability for how funds are used.' WHERE id = 'local-edu-6-opt-2';
UPDATE question_options SET text = 'Neutral—support reviewing current funding adequacy first.' WHERE id = 'local-edu-6-opt-3';
UPDATE question_options SET text = 'No—but streamline regulations to reduce administrative costs.' WHERE id = 'local-edu-6-opt-4';
UPDATE question_options SET text = 'No—because current funding levels are sufficient.' WHERE id = 'local-edu-6-opt-5';

-- local-edu-7: Should state standardized testing requirements be reduced?
UPDATE question_options SET text = 'Yes—because excessive testing takes time away from real learning.' WHERE id = 'local-edu-7-opt-1';
UPDATE question_options SET text = 'Yes—but maintain core assessments for accountability.' WHERE id = 'local-edu-7-opt-2';
UPDATE question_options SET text = 'Neutral—support evaluating which tests add value.' WHERE id = 'local-edu-7-opt-3';
UPDATE question_options SET text = 'No—but improve the quality and relevance of tests.' WHERE id = 'local-edu-7-opt-4';
UPDATE question_options SET text = 'No—because standardized testing ensures educational accountability.' WHERE id = 'local-edu-7-opt-5';

-- local-edu-8: Should public schools provide free meals to all students?
UPDATE question_options SET text = 'Yes—because no child should go hungry at school regardless of income.' WHERE id = 'local-edu-8-opt-1';
UPDATE question_options SET text = 'Yes—but prioritize funding for low-income students.' WHERE id = 'local-edu-8-opt-2';
UPDATE question_options SET text = 'Neutral—support expanding access while managing costs.' WHERE id = 'local-edu-8-opt-3';
UPDATE question_options SET text = 'No—but keep free meals available for qualifying families.' WHERE id = 'local-edu-8-opt-4';
UPDATE question_options SET text = 'No—because school meals should be a family responsibility.' WHERE id = 'local-edu-8-opt-5';

-- local-edu-9: Should the state fund universal pre-K programs?
UPDATE question_options SET text = 'Yes—because early education sets the foundation for lifelong success.' WHERE id = 'local-edu-9-opt-1';
UPDATE question_options SET text = 'Yes—but focus on underserved communities first.' WHERE id = 'local-edu-9-opt-2';
UPDATE question_options SET text = 'Neutral—support studying outcomes before full expansion.' WHERE id = 'local-edu-9-opt-3';
UPDATE question_options SET text = 'No—but offer tax credits for private pre-K expenses.' WHERE id = 'local-edu-9-opt-4';
UPDATE question_options SET text = 'No—because pre-K should be a family choice, not state-funded.' WHERE id = 'local-edu-9-opt-5';

-- local-health-1: Should local health departments receive more state funding?
UPDATE question_options SET text = 'Yes—because public health infrastructure protects entire communities.' WHERE id = 'local-health-1-opt-1';
UPDATE question_options SET text = 'Yes—but tie funding to measurable health outcomes.' WHERE id = 'local-health-1-opt-2';
UPDATE question_options SET text = 'Neutral—support reviewing current funding levels first.' WHERE id = 'local-health-1-opt-3';
UPDATE question_options SET text = 'No—but improve efficiency in existing health programs.' WHERE id = 'local-health-1-opt-4';
UPDATE question_options SET text = 'No—because health departments should operate within current budgets.' WHERE id = 'local-health-1-opt-5';

-- local-health-10: Should local governments fund needle exchange programs?
UPDATE question_options SET text = 'Yes—because harm reduction saves lives and reduces disease spread.' WHERE id = 'local-health-10-opt-1';
UPDATE question_options SET text = 'Yes—but pair programs with treatment referral services.' WHERE id = 'local-health-10-opt-2';
UPDATE question_options SET text = 'Neutral—support pilot programs to evaluate effectiveness.' WHERE id = 'local-health-10-opt-3';
UPDATE question_options SET text = 'No—but focus funding on treatment and recovery instead.' WHERE id = 'local-health-10-opt-4';
UPDATE question_options SET text = 'No—because needle exchanges enable drug use.' WHERE id = 'local-health-10-opt-5';

-- local-health-11: Should the state regulate pesticide use near residential areas?
UPDATE question_options SET text = 'Yes—because pesticide exposure threatens community health.' WHERE id = 'local-health-11-opt-1';
UPDATE question_options SET text = 'Yes—but with exemptions for essential agricultural operations.' WHERE id = 'local-health-11-opt-2';
UPDATE question_options SET text = 'Neutral—support reviewing current safety buffer requirements.' WHERE id = 'local-health-11-opt-3';
UPDATE question_options SET text = 'No—but require notification to nearby residents.' WHERE id = 'local-health-11-opt-4';
UPDATE question_options SET text = 'No—because pesticide regulation should be minimal.' WHERE id = 'local-health-11-opt-5';

-- local-health-12: Should public hospitals receive increased state funding?
UPDATE question_options SET text = 'Yes—because public hospitals serve as the safety net for all residents.' WHERE id = 'local-health-12-opt-1';
UPDATE question_options SET text = 'Yes—but tie funding to quality metrics and patient outcomes.' WHERE id = 'local-health-12-opt-2';
UPDATE question_options SET text = 'Neutral—support evaluating current hospital funding needs.' WHERE id = 'local-health-12-opt-3';
UPDATE question_options SET text = 'No—but encourage private hospital partnerships instead.' WHERE id = 'local-health-12-opt-4';
UPDATE question_options SET text = 'No—because hospital funding should come from patient revenue.' WHERE id = 'local-health-12-opt-5';

-- local-health-13: Should the state fund lead paint and asbestos remediation programs?
UPDATE question_options SET text = 'Yes—because toxic exposure is a serious public health emergency.' WHERE id = 'local-health-13-opt-1';
UPDATE question_options SET text = 'Yes—but prioritize homes with children and elderly residents.' WHERE id = 'local-health-13-opt-2';
UPDATE question_options SET text = 'Neutral—support assessing the scope of the problem first.' WHERE id = 'local-health-13-opt-3';
UPDATE question_options SET text = 'No—but hold property owners accountable for remediation.' WHERE id = 'local-health-13-opt-4';
UPDATE question_options SET text = 'No—because remediation should be the property owner''s responsibility.' WHERE id = 'local-health-13-opt-5';

-- local-health-14: Should local governments expand school-based health services?
UPDATE question_options SET text = 'Yes—because schools are the best place to reach underserved children.' WHERE id = 'local-health-14-opt-1';
UPDATE question_options SET text = 'Yes—but focus on mental health and preventive screenings.' WHERE id = 'local-health-14-opt-2';
UPDATE question_options SET text = 'Neutral—support evaluating current school health resources.' WHERE id = 'local-health-14-opt-3';
UPDATE question_options SET text = 'No—but improve referral systems to community health providers.' WHERE id = 'local-health-14-opt-4';
UPDATE question_options SET text = 'No—because health services belong in clinics, not schools.' WHERE id = 'local-health-14-opt-5';

-- local-health-15: Should the state invest in disease surveillance and emergency preparedness?
UPDATE question_options SET text = 'Yes—because early detection saves lives during outbreaks.' WHERE id = 'local-health-15-opt-1';
UPDATE question_options SET text = 'Yes—but coordinate with federal agencies to avoid duplication.' WHERE id = 'local-health-15-opt-2';
UPDATE question_options SET text = 'Neutral—support reviewing current preparedness levels.' WHERE id = 'local-health-15-opt-3';
UPDATE question_options SET text = 'No—but rely on existing federal systems for disease monitoring.' WHERE id = 'local-health-15-opt-4';
UPDATE question_options SET text = 'No—because current preparedness spending is sufficient.' WHERE id = 'local-health-15-opt-5';

-- local-health-16: Should local governments fund programs to address food deserts?
UPDATE question_options SET text = 'Yes—because access to healthy food is a basic community need.' WHERE id = 'local-health-16-opt-1';
UPDATE question_options SET text = 'Yes—but focus on incentives for grocery stores in underserved areas.' WHERE id = 'local-health-16-opt-2';
UPDATE question_options SET text = 'Neutral—support studying the most effective interventions.' WHERE id = 'local-health-16-opt-3';
UPDATE question_options SET text = 'No—but encourage farmers markets and community gardens.' WHERE id = 'local-health-16-opt-4';
UPDATE question_options SET text = 'No—because food access should be solved by the free market.' WHERE id = 'local-health-16-opt-5';

-- local-health-17: Should the state expand telehealth access in rural areas?
UPDATE question_options SET text = 'Yes—because rural residents deserve equal access to healthcare.' WHERE id = 'local-health-17-opt-1';
UPDATE question_options SET text = 'Yes—but ensure broadband infrastructure supports it first.' WHERE id = 'local-health-17-opt-2';
UPDATE question_options SET text = 'Neutral—support pilot programs in the most underserved areas.' WHERE id = 'local-health-17-opt-3';
UPDATE question_options SET text = 'No—but reduce regulatory barriers for telehealth providers.' WHERE id = 'local-health-17-opt-4';
UPDATE question_options SET text = 'No—because telehealth should develop through private investment.' WHERE id = 'local-health-17-opt-5';

-- local-health-18: Should local governments regulate e-cigarette and vaping sales?
UPDATE question_options SET text = 'Yes—because vaping products pose serious health risks, especially to youth.' WHERE id = 'local-health-18-opt-1';
UPDATE question_options SET text = 'Yes—but focus regulations on sales to minors specifically.' WHERE id = 'local-health-18-opt-2';
UPDATE question_options SET text = 'Neutral—support studying health impacts before deciding.' WHERE id = 'local-health-18-opt-3';
UPDATE question_options SET text = 'No—but require clear health warning labels.' WHERE id = 'local-health-18-opt-4';
UPDATE question_options SET text = 'No—because adults should make their own choices about vaping.' WHERE id = 'local-health-18-opt-5';

-- local-health-19: Should the state fund community health worker programs?
UPDATE question_options SET text = 'Yes—because community health workers bridge critical gaps in care.' WHERE id = 'local-health-19-opt-1';
UPDATE question_options SET text = 'Yes—but target programs to the highest-need communities.' WHERE id = 'local-health-19-opt-2';
UPDATE question_options SET text = 'Neutral—support evaluating program effectiveness first.' WHERE id = 'local-health-19-opt-3';
UPDATE question_options SET text = 'No—but encourage hospitals to fund outreach workers.' WHERE id = 'local-health-19-opt-4';
UPDATE question_options SET text = 'No—because healthcare outreach should be privately organized.' WHERE id = 'local-health-19-opt-5';

-- local-health-2: Should the state invest more in water quality and infrastructure?
UPDATE question_options SET text = 'Yes—because clean water is a fundamental right for all residents.' WHERE id = 'local-health-2-opt-1';
UPDATE question_options SET text = 'Yes—but prioritize the most aging and vulnerable systems.' WHERE id = 'local-health-2-opt-2';
UPDATE question_options SET text = 'Neutral—support assessing infrastructure conditions first.' WHERE id = 'local-health-2-opt-3';
UPDATE question_options SET text = 'No—but encourage local utilities to invest more.' WHERE id = 'local-health-2-opt-4';
UPDATE question_options SET text = 'No—because current water infrastructure spending is adequate.' WHERE id = 'local-health-2-opt-5';

-- local-health-20: Should local governments mandate health impact assessments for new developments?
UPDATE question_options SET text = 'Yes—because development decisions should consider public health effects.' WHERE id = 'local-health-20-opt-1';
UPDATE question_options SET text = 'Yes—but only for large-scale projects above a certain threshold.' WHERE id = 'local-health-20-opt-2';
UPDATE question_options SET text = 'Neutral—support voluntary assessments as a starting point.' WHERE id = 'local-health-20-opt-3';
UPDATE question_options SET text = 'No—but include health factors in existing environmental reviews.' WHERE id = 'local-health-20-opt-4';
UPDATE question_options SET text = 'No—because additional mandates slow economic development.' WHERE id = 'local-health-20-opt-5';

-- local-health-3: Should local governments expand mental health services?
UPDATE question_options SET text = 'Yes—because the mental health crisis demands urgent public investment.' WHERE id = 'local-health-3-opt-1';
UPDATE question_options SET text = 'Yes—but focus on underserved and high-need populations.' WHERE id = 'local-health-3-opt-2';
UPDATE question_options SET text = 'Neutral—support studying gaps in current service coverage.' WHERE id = 'local-health-3-opt-3';
UPDATE question_options SET text = 'No—but partner with private providers to expand access.' WHERE id = 'local-health-3-opt-4';
UPDATE question_options SET text = 'No—because mental health services should be privately funded.' WHERE id = 'local-health-3-opt-5';

-- local-health-4: Should the state ban smoking in all public spaces?
UPDATE question_options SET text = 'Yes—because secondhand smoke endangers public health.' WHERE id = 'local-health-4-opt-1';
UPDATE question_options SET text = 'Yes—but allow designated outdoor smoking areas.' WHERE id = 'local-health-4-opt-2';
UPDATE question_options SET text = 'Neutral—support local governments deciding their own policies.' WHERE id = 'local-health-4-opt-3';
UPDATE question_options SET text = 'No—but require clear separation of smoking and non-smoking areas.' WHERE id = 'local-health-4-opt-4';
UPDATE question_options SET text = 'No—because personal freedoms should not be restricted this way.' WHERE id = 'local-health-4-opt-5';

-- local-health-5: Should local governments expand substance abuse treatment programs?
UPDATE question_options SET text = 'Yes—because treatment is more effective than incarceration.' WHERE id = 'local-health-5-opt-1';
UPDATE question_options SET text = 'Yes—but focus on evidence-based programs with proven results.' WHERE id = 'local-health-5-opt-2';
UPDATE question_options SET text = 'Neutral—support evaluating current treatment capacity first.' WHERE id = 'local-health-5-opt-3';
UPDATE question_options SET text = 'No—but partner with nonprofits and faith-based organizations.' WHERE id = 'local-health-5-opt-4';
UPDATE question_options SET text = 'No—because substance abuse treatment should be privately funded.' WHERE id = 'local-health-5-opt-5';

-- local-health-6: Should the state mandate vaccinations for public school students?
UPDATE question_options SET text = 'Yes—because vaccines protect the entire school community.' WHERE id = 'local-health-6-opt-1';
UPDATE question_options SET text = 'Yes—but allow medical exemptions when appropriate.' WHERE id = 'local-health-6-opt-2';
UPDATE question_options SET text = 'Neutral—support strong encouragement without strict mandates.' WHERE id = 'local-health-6-opt-3';
UPDATE question_options SET text = 'No—but require education on vaccine benefits instead.' WHERE id = 'local-health-6-opt-4';
UPDATE question_options SET text = 'No—because vaccination should be a personal family decision.' WHERE id = 'local-health-6-opt-5';

-- local-health-7: Should local governments fund free health clinics for uninsured residents?
UPDATE question_options SET text = 'Yes—because everyone deserves access to basic healthcare.' WHERE id = 'local-health-7-opt-1';
UPDATE question_options SET text = 'Yes—but focus on preventive and urgent care services.' WHERE id = 'local-health-7-opt-2';
UPDATE question_options SET text = 'Neutral—support evaluating current uninsured population needs.' WHERE id = 'local-health-7-opt-3';
UPDATE question_options SET text = 'No—but expand eligibility for existing insurance programs.' WHERE id = 'local-health-7-opt-4';
UPDATE question_options SET text = 'No—because healthcare should be funded through private insurance.' WHERE id = 'local-health-7-opt-5';

-- local-health-8: Should the state regulate fast food and sugary drink sales near schools?
UPDATE question_options SET text = 'Yes—because protecting children''s health near schools is essential.' WHERE id = 'local-health-8-opt-1';
UPDATE question_options SET text = 'Yes—but focus on nutrition education alongside regulation.' WHERE id = 'local-health-8-opt-2';
UPDATE question_options SET text = 'Neutral—support studying the health impact before regulating.' WHERE id = 'local-health-8-opt-3';
UPDATE question_options SET text = 'No—but encourage schools to promote healthy alternatives.' WHERE id = 'local-health-8-opt-4';
UPDATE question_options SET text = 'No—because food choices should be left to individuals and families.' WHERE id = 'local-health-8-opt-5';

-- local-health-9: Should local governments invest more in air quality monitoring?
UPDATE question_options SET text = 'Yes—because residents have a right to know about air quality risks.' WHERE id = 'local-health-9-opt-1';
UPDATE question_options SET text = 'Yes—but prioritize areas near industrial zones and highways.' WHERE id = 'local-health-9-opt-2';
UPDATE question_options SET text = 'Neutral—support reviewing existing monitoring coverage.' WHERE id = 'local-health-9-opt-3';
UPDATE question_options SET text = 'No—but require industries to self-report emissions data.' WHERE id = 'local-health-9-opt-4';
UPDATE question_options SET text = 'No—because current monitoring is sufficient.' WHERE id = 'local-health-9-opt-5';

-- local-housing-1: Should local governments increase funding for affordable housing?
UPDATE question_options SET text = 'Yes—because the housing crisis demands urgent public investment.' WHERE id = 'local-housing-1-opt-1';
UPDATE question_options SET text = 'Yes—but focus on the most cost-effective housing models.' WHERE id = 'local-housing-1-opt-2';
UPDATE question_options SET text = 'Neutral—support studying housing needs before expanding funding.' WHERE id = 'local-housing-1-opt-3';
UPDATE question_options SET text = 'No—but reduce zoning barriers to increase private development.' WHERE id = 'local-housing-1-opt-4';
UPDATE question_options SET text = 'No—because housing should be provided by the private market.' WHERE id = 'local-housing-1-opt-5';

-- local-housing-10: Should local governments ban housing discrimination based on source of income?
UPDATE question_options SET text = 'Yes—because voucher holders deserve equal access to housing.' WHERE id = 'local-housing-10-opt-1';
UPDATE question_options SET text = 'Yes—but provide support for landlords who accept vouchers.' WHERE id = 'local-housing-10-opt-2';
UPDATE question_options SET text = 'Neutral—support studying the impact on housing availability.' WHERE id = 'local-housing-10-opt-3';
UPDATE question_options SET text = 'No—but encourage voluntary landlord participation programs.' WHERE id = 'local-housing-10-opt-4';
UPDATE question_options SET text = 'No—because landlords should choose tenants based on their criteria.' WHERE id = 'local-housing-10-opt-5';

-- local-housing-11: Should the state fund programs to prevent foreclosures?
UPDATE question_options SET text = 'Yes—because keeping families in their homes stabilizes communities.' WHERE id = 'local-housing-11-opt-1';
UPDATE question_options SET text = 'Yes—but focus on counseling and mortgage modification assistance.' WHERE id = 'local-housing-11-opt-2';
UPDATE question_options SET text = 'Neutral—support evaluating current foreclosure prevention efforts.' WHERE id = 'local-housing-11-opt-3';
UPDATE question_options SET text = 'No—but improve financial literacy to prevent future defaults.' WHERE id = 'local-housing-11-opt-4';
UPDATE question_options SET text = 'No—because foreclosure is a natural market correction.' WHERE id = 'local-housing-11-opt-5';

-- local-housing-12: Should local governments invest in mixed-use development zones?
UPDATE question_options SET text = 'Yes—because mixed-use development creates vibrant, walkable communities.' WHERE id = 'local-housing-12-opt-1';
UPDATE question_options SET text = 'Yes—but ensure affordable housing is included in mixed-use plans.' WHERE id = 'local-housing-12-opt-2';
UPDATE question_options SET text = 'Neutral—support case-by-case evaluation of mixed-use proposals.' WHERE id = 'local-housing-12-opt-3';
UPDATE question_options SET text = 'No—but allow market demand to guide development decisions.' WHERE id = 'local-housing-12-opt-4';
UPDATE question_options SET text = 'No—because government should not direct development patterns.' WHERE id = 'local-housing-12-opt-5';

-- local-housing-13: Should the state expand rent assistance programs for low-income residents?
UPDATE question_options SET text = 'Yes—because rent assistance prevents homelessness and instability.' WHERE id = 'local-housing-13-opt-1';
UPDATE question_options SET text = 'Yes—but include time limits and employment support requirements.' WHERE id = 'local-housing-13-opt-2';
UPDATE question_options SET text = 'Neutral—support reviewing current program effectiveness.' WHERE id = 'local-housing-13-opt-3';
UPDATE question_options SET text = 'No—but increase housing supply to naturally lower rents.' WHERE id = 'local-housing-13-opt-4';
UPDATE question_options SET text = 'No—because rent assistance distorts the housing market.' WHERE id = 'local-housing-13-opt-5';

-- local-housing-14: Should local governments offer property tax abatements for new construction?
UPDATE question_options SET text = 'Yes—because abatements attract investment and create jobs.' WHERE id = 'local-housing-14-opt-1';
UPDATE question_options SET text = 'Yes—but only in economically distressed areas.' WHERE id = 'local-housing-14-opt-2';
UPDATE question_options SET text = 'Neutral—support evaluating the return on investment of abatements.' WHERE id = 'local-housing-14-opt-3';
UPDATE question_options SET text = 'No—but streamline permitting to encourage construction.' WHERE id = 'local-housing-14-opt-4';
UPDATE question_options SET text = 'No—because abatements shift the tax burden to existing property owners.' WHERE id = 'local-housing-14-opt-5';

-- local-housing-15: Should the state fund lead and mold remediation in older homes?
UPDATE question_options SET text = 'Yes—because toxic homes endanger families, especially children.' WHERE id = 'local-housing-15-opt-1';
UPDATE question_options SET text = 'Yes—but prioritize homes with children and elderly residents.' WHERE id = 'local-housing-15-opt-2';
UPDATE question_options SET text = 'Neutral—support assessing the scale of the problem first.' WHERE id = 'local-housing-15-opt-3';
UPDATE question_options SET text = 'No—but require disclosure of hazards during home sales.' WHERE id = 'local-housing-15-opt-4';
UPDATE question_options SET text = 'No—because remediation is the homeowner''s responsibility.' WHERE id = 'local-housing-15-opt-5';

-- local-housing-16: Should local governments enforce stricter building code inspections?
UPDATE question_options SET text = 'Yes—because strong codes protect residents from unsafe housing.' WHERE id = 'local-housing-16-opt-1';
UPDATE question_options SET text = 'Yes—but streamline inspection processes to reduce delays.' WHERE id = 'local-housing-16-opt-2';
UPDATE question_options SET text = 'Neutral—support reviewing current code enforcement effectiveness.' WHERE id = 'local-housing-16-opt-3';
UPDATE question_options SET text = 'No—but focus inspections on high-risk properties only.' WHERE id = 'local-housing-16-opt-4';
UPDATE question_options SET text = 'No—because excessive inspections increase housing costs.' WHERE id = 'local-housing-16-opt-5';

-- local-housing-17: Should the state provide down payment assistance for essential workers?
UPDATE question_options SET text = 'Yes—because essential workers deserve to live in the communities they serve.' WHERE id = 'local-housing-17-opt-1';
UPDATE question_options SET text = 'Yes—but focus on teachers, first responders, and healthcare workers.' WHERE id = 'local-housing-17-opt-2';
UPDATE question_options SET text = 'Neutral—support evaluating the impact on housing markets.' WHERE id = 'local-housing-17-opt-3';
UPDATE question_options SET text = 'No—but expand general first-time buyer programs instead.' WHERE id = 'local-housing-17-opt-4';
UPDATE question_options SET text = 'No—because housing assistance should not target specific occupations.' WHERE id = 'local-housing-17-opt-5';

-- local-housing-18: Should local governments use eminent domain for affordable housing development?
UPDATE question_options SET text = 'Yes—because community housing needs can outweigh individual property rights.' WHERE id = 'local-housing-18-opt-1';
UPDATE question_options SET text = 'Yes—but only as a last resort with fair market compensation.' WHERE id = 'local-housing-18-opt-2';
UPDATE question_options SET text = 'Neutral—support strict criteria and community input requirements.' WHERE id = 'local-housing-18-opt-3';
UPDATE question_options SET text = 'No—but offer voluntary buyout programs instead.' WHERE id = 'local-housing-18-opt-4';
UPDATE question_options SET text = 'No—because eminent domain should never be used for housing projects.' WHERE id = 'local-housing-18-opt-5';

-- local-housing-19: Should the state fund rural housing development programs?
UPDATE question_options SET text = 'Yes—because rural communities deserve quality housing options.' WHERE id = 'local-housing-19-opt-1';
UPDATE question_options SET text = 'Yes—but focus on areas with the greatest housing shortages.' WHERE id = 'local-housing-19-opt-2';
UPDATE question_options SET text = 'Neutral—support studying rural housing needs before investing.' WHERE id = 'local-housing-19-opt-3';
UPDATE question_options SET text = 'No—but reduce regulatory barriers for rural construction.' WHERE id = 'local-housing-19-opt-4';
UPDATE question_options SET text = 'No—because rural housing should be driven by private development.' WHERE id = 'local-housing-19-opt-5';

-- local-housing-2: Should zoning laws be reformed to allow more multifamily housing?
UPDATE question_options SET text = 'Yes—because restrictive zoning drives up housing costs for everyone.' WHERE id = 'local-housing-2-opt-1';
UPDATE question_options SET text = 'Yes—but with community input on density and design standards.' WHERE id = 'local-housing-2-opt-2';
UPDATE question_options SET text = 'Neutral—support reviewing zoning on a case-by-case basis.' WHERE id = 'local-housing-2-opt-3';
UPDATE question_options SET text = 'No—but allow accessory dwelling units in single-family zones.' WHERE id = 'local-housing-2-opt-4';
UPDATE question_options SET text = 'No—because current zoning protects neighborhood character.' WHERE id = 'local-housing-2-opt-5';

-- local-housing-20: Should local governments create community land trusts for permanently affordable housing?
UPDATE question_options SET text = 'Yes—because land trusts ensure long-term affordability for communities.' WHERE id = 'local-housing-20-opt-1';
UPDATE question_options SET text = 'Yes—but start with pilot programs in high-cost areas.' WHERE id = 'local-housing-20-opt-2';
UPDATE question_options SET text = 'Neutral—support studying successful land trust models.' WHERE id = 'local-housing-20-opt-3';
UPDATE question_options SET text = 'No—but encourage private affordable housing commitments.' WHERE id = 'local-housing-20-opt-4';
UPDATE question_options SET text = 'No—because government land ownership distorts the housing market.' WHERE id = 'local-housing-20-opt-5';

-- local-housing-3: Should the state offer tax incentives for first-time homebuyers?
UPDATE question_options SET text = 'Yes—because homeownership should be accessible to everyone.' WHERE id = 'local-housing-3-opt-1';
UPDATE question_options SET text = 'Yes—but limit incentives to low- and moderate-income buyers.' WHERE id = 'local-housing-3-opt-2';
UPDATE question_options SET text = 'Neutral—support evaluating existing homebuyer assistance programs.' WHERE id = 'local-housing-3-opt-3';
UPDATE question_options SET text = 'No—but reduce closing cost regulations to lower barriers.' WHERE id = 'local-housing-3-opt-4';
UPDATE question_options SET text = 'No—because the housing market should operate without subsidies.' WHERE id = 'local-housing-3-opt-5';

-- local-housing-4: Should local governments strengthen tenant protection laws?
UPDATE question_options SET text = 'Yes—because renters need strong protections against unfair practices.' WHERE id = 'local-housing-4-opt-1';
UPDATE question_options SET text = 'Yes—but balance protections with landlord rights.' WHERE id = 'local-housing-4-opt-2';
UPDATE question_options SET text = 'Neutral—support reviewing current tenant-landlord regulations.' WHERE id = 'local-housing-4-opt-3';
UPDATE question_options SET text = 'No—but improve mediation and dispute resolution options.' WHERE id = 'local-housing-4-opt-4';
UPDATE question_options SET text = 'No—because tenant-landlord relations should be contract-based.' WHERE id = 'local-housing-4-opt-5';

-- local-housing-5: Should the state fund homeless shelter expansions?
UPDATE question_options SET text = 'Yes—because every person deserves safe shelter as a basic right.' WHERE id = 'local-housing-5-opt-1';
UPDATE question_options SET text = 'Yes—but pair shelters with job training and support services.' WHERE id = 'local-housing-5-opt-2';
UPDATE question_options SET text = 'Neutral—support evaluating current shelter capacity gaps.' WHERE id = 'local-housing-5-opt-3';
UPDATE question_options SET text = 'No—but encourage faith-based and nonprofit shelter programs.' WHERE id = 'local-housing-5-opt-4';
UPDATE question_options SET text = 'No—because homelessness should be addressed through private charity.' WHERE id = 'local-housing-5-opt-5';

-- local-housing-6: Should local governments require developers to include affordable units?
UPDATE question_options SET text = 'Yes—because development should serve all income levels.' WHERE id = 'local-housing-6-opt-1';
UPDATE question_options SET text = 'Yes—but offer density bonuses in exchange for affordable units.' WHERE id = 'local-housing-6-opt-2';
UPDATE question_options SET text = 'Neutral—support studying the impact on development costs.' WHERE id = 'local-housing-6-opt-3';
UPDATE question_options SET text = 'No—but offer voluntary incentive programs for affordability.' WHERE id = 'local-housing-6-opt-4';
UPDATE question_options SET text = 'No—because mandates increase costs and reduce overall housing supply.' WHERE id = 'local-housing-6-opt-5';

-- local-housing-7: Should the state invest in public housing construction?
UPDATE question_options SET text = 'Yes—because public housing is essential for those who cannot afford rent.' WHERE id = 'local-housing-7-opt-1';
UPDATE question_options SET text = 'Yes—but modernize existing public housing before building new.' WHERE id = 'local-housing-7-opt-2';
UPDATE question_options SET text = 'Neutral—support mixed-income development models.' WHERE id = 'local-housing-7-opt-3';
UPDATE question_options SET text = 'No—but expand housing vouchers for private market units.' WHERE id = 'local-housing-7-opt-4';
UPDATE question_options SET text = 'No—because government should not be in the housing business.' WHERE id = 'local-housing-7-opt-5';

-- local-housing-8: Should local governments offer grants for home energy efficiency upgrades?
UPDATE question_options SET text = 'Yes—because efficiency upgrades reduce costs and protect the environment.' WHERE id = 'local-housing-8-opt-1';
UPDATE question_options SET text = 'Yes—but target grants to low-income homeowners.' WHERE id = 'local-housing-8-opt-2';
UPDATE question_options SET text = 'Neutral—support reviewing the cost-effectiveness of grant programs.' WHERE id = 'local-housing-8-opt-3';
UPDATE question_options SET text = 'No—but offer low-interest loans for upgrades instead.' WHERE id = 'local-housing-8-opt-4';
UPDATE question_options SET text = 'No—because home improvements should be privately funded.' WHERE id = 'local-housing-8-opt-5';

-- local-housing-9: Should the state regulate short-term rental platforms like Airbnb?
UPDATE question_options SET text = 'Yes—because short-term rentals reduce available housing for residents.' WHERE id = 'local-housing-9-opt-1';
UPDATE question_options SET text = 'Yes—but allow limited rentals with registration requirements.' WHERE id = 'local-housing-9-opt-2';
UPDATE question_options SET text = 'Neutral—support local communities setting their own rules.' WHERE id = 'local-housing-9-opt-3';
UPDATE question_options SET text = 'No—but require hosts to collect and remit local taxes.' WHERE id = 'local-housing-9-opt-4';
UPDATE question_options SET text = 'No—because property owners should freely rent their property.' WHERE id = 'local-housing-9-opt-5';

-- local-safety-1: Should local governments increase funding for police departments?
UPDATE question_options SET text = 'Yes—because well-funded police are essential to public safety.' WHERE id = 'local-safety-1-opt-1';
UPDATE question_options SET text = 'Yes—but tie increases to training and accountability measures.' WHERE id = 'local-safety-1-opt-2';
UPDATE question_options SET text = 'Neutral—support reviewing current public safety spending.' WHERE id = 'local-safety-1-opt-3';
UPDATE question_options SET text = 'No—but invest in community-based violence prevention instead.' WHERE id = 'local-safety-1-opt-4';
UPDATE question_options SET text = 'No—because police budgets should be reduced and reallocated.' WHERE id = 'local-safety-1-opt-5';

-- local-safety-10: Should the state fund programs to reduce juvenile crime?
UPDATE question_options SET text = 'Yes—because early intervention prevents lifelong criminal patterns.' WHERE id = 'local-safety-10-opt-1';
UPDATE question_options SET text = 'Yes—but focus on mentoring and education programs.' WHERE id = 'local-safety-10-opt-2';
UPDATE question_options SET text = 'Neutral—support evaluating current youth crime prevention efforts.' WHERE id = 'local-safety-10-opt-3';
UPDATE question_options SET text = 'No—but strengthen family support services instead.' WHERE id = 'local-safety-10-opt-4';
UPDATE question_options SET text = 'No—because juvenile crime should be addressed by families.' WHERE id = 'local-safety-10-opt-5';

-- local-safety-11: Should local governments create civilian oversight boards for police?
UPDATE question_options SET text = 'Yes—because independent oversight ensures police accountability.' WHERE id = 'local-safety-11-opt-1';
UPDATE question_options SET text = 'Yes—but give boards investigative authority, not just advisory roles.' WHERE id = 'local-safety-11-opt-2';
UPDATE question_options SET text = 'Neutral—support reviewing existing accountability mechanisms.' WHERE id = 'local-safety-11-opt-3';
UPDATE question_options SET text = 'No—but strengthen internal affairs and complaint processes.' WHERE id = 'local-safety-11-opt-4';
UPDATE question_options SET text = 'No—because civilian boards undermine police authority.' WHERE id = 'local-safety-11-opt-5';

-- local-safety-12: Should the state increase penalties for repeat offenders?
UPDATE question_options SET text = 'Yes—because stronger penalties protect the community from habitual criminals.' WHERE id = 'local-safety-12-opt-1';
UPDATE question_options SET text = 'Yes—but ensure penalties are proportionate to the crime.' WHERE id = 'local-safety-12-opt-2';
UPDATE question_options SET text = 'Neutral—support reviewing sentencing guidelines for effectiveness.' WHERE id = 'local-safety-12-opt-3';
UPDATE question_options SET text = 'No—but invest in rehabilitation to reduce repeat offenses.' WHERE id = 'local-safety-12-opt-4';
UPDATE question_options SET text = 'No—because harsher penalties do not reduce recidivism.' WHERE id = 'local-safety-12-opt-5';

-- local-safety-13: Should local governments expand disaster preparedness programs?
UPDATE question_options SET text = 'Yes—because communities must be prepared for natural disasters.' WHERE id = 'local-safety-13-opt-1';
UPDATE question_options SET text = 'Yes—but coordinate with state and federal agencies.' WHERE id = 'local-safety-13-opt-2';
UPDATE question_options SET text = 'Neutral—support reviewing current preparedness plans.' WHERE id = 'local-safety-13-opt-3';
UPDATE question_options SET text = 'No—but encourage individual and family preparedness.' WHERE id = 'local-safety-13-opt-4';
UPDATE question_options SET text = 'No—because current disaster programs are sufficient.' WHERE id = 'local-safety-13-opt-5';

-- local-safety-14: Should the state reform bail and pretrial detention practices?
UPDATE question_options SET text = 'Yes—because cash bail unfairly punishes people who are poor.' WHERE id = 'local-safety-14-opt-1';
UPDATE question_options SET text = 'Yes—but maintain detention for those who pose a public safety risk.' WHERE id = 'local-safety-14-opt-2';
UPDATE question_options SET text = 'Neutral—support studying the impact of reform before acting.' WHERE id = 'local-safety-14-opt-3';
UPDATE question_options SET text = 'No—but improve the speed of court proceedings.' WHERE id = 'local-safety-14-opt-4';
UPDATE question_options SET text = 'No—because bail ensures defendants appear for trial.' WHERE id = 'local-safety-14-opt-5';

-- local-safety-15: Should local governments fund drug courts and mental health courts?
UPDATE question_options SET text = 'Yes—because specialized courts address root causes more effectively.' WHERE id = 'local-safety-15-opt-1';
UPDATE question_options SET text = 'Yes—but ensure participants receive comprehensive support services.' WHERE id = 'local-safety-15-opt-2';
UPDATE question_options SET text = 'Neutral—support evaluating outcomes of existing specialty courts.' WHERE id = 'local-safety-15-opt-3';
UPDATE question_options SET text = 'No—but train traditional courts on addiction and mental health.' WHERE id = 'local-safety-15-opt-4';
UPDATE question_options SET text = 'No—because all offenders should go through the standard court system.' WHERE id = 'local-safety-15-opt-5';

-- local-safety-16: Should the state invest in cybersecurity for local government systems?
UPDATE question_options SET text = 'Yes—because cyberattacks on government systems threaten public safety.' WHERE id = 'local-safety-16-opt-1';
UPDATE question_options SET text = 'Yes—but focus on critical infrastructure and voter systems.' WHERE id = 'local-safety-16-opt-2';
UPDATE question_options SET text = 'Neutral—support assessing current cybersecurity vulnerabilities.' WHERE id = 'local-safety-16-opt-3';
UPDATE question_options SET text = 'No—but provide training and guidelines for local IT staff.' WHERE id = 'local-safety-16-opt-4';
UPDATE question_options SET text = 'No—because local governments should fund their own cybersecurity.' WHERE id = 'local-safety-16-opt-5';

-- local-safety-17: Should local governments expand domestic violence prevention programs?
UPDATE question_options SET text = 'Yes—because domestic violence is a crisis that demands more resources.' WHERE id = 'local-safety-17-opt-1';
UPDATE question_options SET text = 'Yes—but focus on shelter capacity and legal assistance.' WHERE id = 'local-safety-17-opt-2';
UPDATE question_options SET text = 'Neutral—support evaluating current program reach and effectiveness.' WHERE id = 'local-safety-17-opt-3';
UPDATE question_options SET text = 'No—but strengthen partnerships with existing service providers.' WHERE id = 'local-safety-17-opt-4';
UPDATE question_options SET text = 'No—because domestic violence prevention should be privately funded.' WHERE id = 'local-safety-17-opt-5';

-- local-safety-18: Should the state decriminalize minor drug offenses?
UPDATE question_options SET text = 'Yes—because criminalization wastes resources and ruins lives.' WHERE id = 'local-safety-18-opt-1';
UPDATE question_options SET text = 'Yes—but pair decriminalization with treatment requirements.' WHERE id = 'local-safety-18-opt-2';
UPDATE question_options SET text = 'Neutral—support studying the public health impact of decriminalization.' WHERE id = 'local-safety-18-opt-3';
UPDATE question_options SET text = 'No—but reduce penalties to misdemeanors with mandatory treatment.' WHERE id = 'local-safety-18-opt-4';
UPDATE question_options SET text = 'No—because drug offenses should remain fully criminal.' WHERE id = 'local-safety-18-opt-5';

-- local-safety-19: Should local governments fund programs to reduce traffic fatalities?
UPDATE question_options SET text = 'Yes—because traffic deaths are preventable with proper investment.' WHERE id = 'local-safety-19-opt-1';
UPDATE question_options SET text = 'Yes—but focus on the most dangerous roads and intersections.' WHERE id = 'local-safety-19-opt-2';
UPDATE question_options SET text = 'Neutral—support reviewing traffic safety data before investing.' WHERE id = 'local-safety-19-opt-3';
UPDATE question_options SET text = 'No—but improve driver education and enforcement instead.' WHERE id = 'local-safety-19-opt-4';
UPDATE question_options SET text = 'No—because current traffic safety programs are adequate.' WHERE id = 'local-safety-19-opt-5';

-- local-safety-2: Should the state expand community policing programs?
UPDATE question_options SET text = 'Yes—because community policing builds trust and reduces crime.' WHERE id = 'local-safety-2-opt-1';
UPDATE question_options SET text = 'Yes—but ensure programs are tailored to each community''s needs.' WHERE id = 'local-safety-2-opt-2';
UPDATE question_options SET text = 'Neutral—support evaluating existing program effectiveness.' WHERE id = 'local-safety-2-opt-3';
UPDATE question_options SET text = 'No—but improve training within traditional policing models.' WHERE id = 'local-safety-2-opt-4';
UPDATE question_options SET text = 'No—because policing strategies should be department-driven.' WHERE id = 'local-safety-2-opt-5';

-- local-safety-20: Should the state expand hate crime protections and enforcement?
UPDATE question_options SET text = 'Yes—because hate crimes threaten entire communities and demand strong action.' WHERE id = 'local-safety-20-opt-1';
UPDATE question_options SET text = 'Yes—but ensure clear definitions to prevent overreach.' WHERE id = 'local-safety-20-opt-2';
UPDATE question_options SET text = 'Neutral—support reviewing current hate crime statutes.' WHERE id = 'local-safety-20-opt-3';
UPDATE question_options SET text = 'No—but enforce existing laws more vigorously.' WHERE id = 'local-safety-20-opt-4';
UPDATE question_options SET text = 'No—because existing criminal laws already cover these offenses.' WHERE id = 'local-safety-20-opt-5';

-- local-safety-3: Should local governments invest more in fire department equipment and training?
UPDATE question_options SET text = 'Yes—because firefighter safety and readiness protect the whole community.' WHERE id = 'local-safety-3-opt-1';
UPDATE question_options SET text = 'Yes—but prioritize based on risk assessments.' WHERE id = 'local-safety-3-opt-2';
UPDATE question_options SET text = 'Neutral—support reviewing current equipment conditions first.' WHERE id = 'local-safety-3-opt-3';
UPDATE question_options SET text = 'No—but pursue federal grants for major equipment needs.' WHERE id = 'local-safety-3-opt-4';
UPDATE question_options SET text = 'No—because current fire department funding is sufficient.' WHERE id = 'local-safety-3-opt-5';

-- local-safety-4: Should the state mandate body cameras for all law enforcement officers?
UPDATE question_options SET text = 'Yes—because body cameras ensure accountability and protect everyone.' WHERE id = 'local-safety-4-opt-1';
UPDATE question_options SET text = 'Yes—but with clear policies on footage access and privacy.' WHERE id = 'local-safety-4-opt-2';
UPDATE question_options SET text = 'Neutral—support phased implementation with community input.' WHERE id = 'local-safety-4-opt-3';
UPDATE question_options SET text = 'No—but encourage voluntary adoption by departments.' WHERE id = 'local-safety-4-opt-4';
UPDATE question_options SET text = 'No—because body camera mandates are costly and invasive.' WHERE id = 'local-safety-4-opt-5';

-- local-safety-5: Should local governments fund violence intervention and prevention programs?
UPDATE question_options SET text = 'Yes—because prevention is more effective than reactive policing.' WHERE id = 'local-safety-5-opt-1';
UPDATE question_options SET text = 'Yes—but focus on evidence-based programs with proven results.' WHERE id = 'local-safety-5-opt-2';
UPDATE question_options SET text = 'Neutral—support piloting programs before committing to full funding.' WHERE id = 'local-safety-5-opt-3';
UPDATE question_options SET text = 'No—but partner with nonprofits and community organizations.' WHERE id = 'local-safety-5-opt-4';
UPDATE question_options SET text = 'No—because law enforcement should handle public safety.' WHERE id = 'local-safety-5-opt-5';

-- local-safety-6: Should the state strengthen gun control regulations?
UPDATE question_options SET text = 'Yes—because stronger regulations save lives and reduce violence.' WHERE id = 'local-safety-6-opt-1';
UPDATE question_options SET text = 'Yes—but focus on universal background checks and safe storage.' WHERE id = 'local-safety-6-opt-2';
UPDATE question_options SET text = 'Neutral—support enforcing existing laws more effectively.' WHERE id = 'local-safety-6-opt-3';
UPDATE question_options SET text = 'No—but improve mental health screening for gun purchasers.' WHERE id = 'local-safety-6-opt-4';
UPDATE question_options SET text = 'No—because gun rights should not be further restricted.' WHERE id = 'local-safety-6-opt-5';

-- local-safety-7: Should local governments expand emergency dispatch services?
UPDATE question_options SET text = 'Yes—because faster emergency response saves lives.' WHERE id = 'local-safety-7-opt-1';
UPDATE question_options SET text = 'Yes—but invest in technology to improve efficiency first.' WHERE id = 'local-safety-7-opt-2';
UPDATE question_options SET text = 'Neutral—support reviewing current response time standards.' WHERE id = 'local-safety-7-opt-3';
UPDATE question_options SET text = 'No—but optimize existing dispatch operations.' WHERE id = 'local-safety-7-opt-4';
UPDATE question_options SET text = 'No—because current dispatch services are adequate.' WHERE id = 'local-safety-7-opt-5';

-- local-safety-8: Should the state invest in alternatives to incarceration for nonviolent offenders?
UPDATE question_options SET text = 'Yes—because alternatives reduce recidivism and save taxpayer money.' WHERE id = 'local-safety-8-opt-1';
UPDATE question_options SET text = 'Yes—but maintain judicial discretion on a case-by-case basis.' WHERE id = 'local-safety-8-opt-2';
UPDATE question_options SET text = 'Neutral—support studying outcomes of diversion programs.' WHERE id = 'local-safety-8-opt-3';
UPDATE question_options SET text = 'No—but improve rehabilitation programs within prisons.' WHERE id = 'local-safety-8-opt-4';
UPDATE question_options SET text = 'No—because offenders should serve their full sentences.' WHERE id = 'local-safety-8-opt-5';

-- local-safety-9: Should local governments install more public surveillance cameras?
UPDATE question_options SET text = 'Yes—because surveillance cameras deter crime and aid investigations.' WHERE id = 'local-safety-9-opt-1';
UPDATE question_options SET text = 'Yes—but with strict privacy protections and oversight.' WHERE id = 'local-safety-9-opt-2';
UPDATE question_options SET text = 'Neutral—support evaluating effectiveness in high-crime areas.' WHERE id = 'local-safety-9-opt-3';
UPDATE question_options SET text = 'No—but improve street lighting and environmental design instead.' WHERE id = 'local-safety-9-opt-4';
UPDATE question_options SET text = 'No—because public surveillance violates privacy rights.' WHERE id = 'local-safety-9-opt-5';