/**
 * Question ↔ bill-title keyword rules for the vote-derived citation enrichment
 * (answers enrichment push, part 1 — see docs/DATA-ACCURACY.md §Answers).
 *
 * Semantics
 * - `keywords` are case-insensitive substrings matched against `bills.name`.
 * - `axis` says what SUPPORTING (sponsoring/cosponsoring) a matching bill codes on
 *   the app's -10..+10 left/right scale (src/lib/scoring.ts): -1 = left, +1 = right.
 *   This is the SAME convention as candidate_answers.answer_value — NOT agreement
 *   with the question text. A citation is only attached when the rule's axis matches
 *   sign(answer_value) of the stored answer (the "sign-consistency guard"), so a
 *   mismatched keyword polarity results in a missing citation, not a wrong one.
 * - A question may have several rules with different axes (e.g. pro-PRO-Act vs
 *   right-to-work rules on the unionization question).
 *
 * Authoring rules (precision over recall — citations are user-visible evidence):
 * - Prefer intent-bearing phrases ("raise the wage") over bare topics ("wages").
 * - Questions whose bills are genuinely bipartisan (veterans funding, CHIPS,
 *   opioid response, rural broadband...) are deliberately ABSENT: an axis claim
 *   would be arbitrary and the sign guard would attach citations ~randomly.
 * - Process/courts questions with no bill-title signal are absent too.
 *
 * NOTE: the legacy mapping in supabase/functions/populate-candidate-answers/index.ts
 * is NOT reusable here: its question ids predate the current questions table and its
 * direction comment ("1 = supports progressive position" → +10) contradicts the
 * axis convention above. Do not copy from it.
 */

export type AxisDirection = -1 | 1;

export interface QuestionKeywordRule {
  questionId: string;
  axis: AxisDirection;
  keywords: string[];
}

export const QUESTION_BILL_KEYWORDS: QuestionKeywordRule[] = [
  // === Environment / energy ===
  { questionId: 'environment-q7', axis: -1, keywords: ['renewable energy', 'clean energy', 'solar energy', 'wind energy', 'clean electricity'] },
  { questionId: 'environment-q12', axis: -1, keywords: ['pollution', 'superfund', 'pfas accountability'] },
  { questionId: 'environment-q9', axis: -1, keywords: ['emissions standard', 'carbon pollution', 'clean power'] },
  { questionId: 'environment-q11', axis: -1, keywords: ['clean air'] },
  { questionId: 'environment-q6', axis: -1, keywords: ['endangered species recovery', 'wildlife corridor', 'habitat conservation', 'wildlife refuge'] },
  { questionId: 'environment-q8', axis: -1, keywords: ['drilling moratorium', 'offshore drilling ban', 'protect our coast'] },
  { questionId: 'environment-q8', axis: 1, keywords: ['unleashing american energy', 'american energy independence', 'expand offshore leasing'] },
  { questionId: 'environment-q14', axis: -1, keywords: ['plastic pollution', 'single-use plastic', 'break free from plastic'] },
  { questionId: 'environment-q13', axis: -1, keywords: ['microplastic'] },
  { questionId: 'environment-q20', axis: -1, keywords: ['water pollution', 'clean water act'] },
  { questionId: 'environment-q10', axis: -1, keywords: ['methane emission', 'methane fee', 'methane pollution'] },
  { questionId: 'environment-q17', axis: -1, keywords: ['old-growth', 'old growth forest', 'roadless area'] },
  { questionId: 'environment-q18', axis: -1, keywords: ['roadless area', 'forest protection'] },
  { questionId: 'environment-q3', axis: -1, keywords: ['pesticide', 'chlorpyrifos', 'neonicotinoid'] },
  { questionId: 'environment-q16', axis: -1, keywords: ['mining reform', 'hardrock mining', 'boundary waters protection', 'grand canyon protection'] },
  { questionId: 'environment-q4', axis: -1, keywords: ['food waste', 'food recovery', 'food date labeling'] },
  { questionId: 'environment-q15', axis: -1, keywords: ['land and water conservation fund', 'national park'] },
  { questionId: 'environment-q19', axis: -1, keywords: ['drinking water infrastructure', 'lead service line'] },
  { questionId: 'environment-q1', axis: -1, keywords: ['sustainable agriculture', 'regenerative agriculture', 'soil health', 'conservation stewardship'] },
  { questionId: 'environment-q5', axis: -1, keywords: ['animal testing'] },
  { questionId: 'environment-q2', axis: -1, keywords: ['crop insurance for small farm', 'whole farm revenue'] },

  // === Economy / labor / tax ===
  { questionId: 'economy-q15', axis: -1, keywords: ['raise the wage', 'minimum wage', 'living wage'] },
  { questionId: 'economy-q16', axis: -1, keywords: ['right to organize', 'collective bargaining', 'public service freedom to negotiate'] },
  { questionId: 'economy-q16', axis: 1, keywords: ['right-to-work', 'right to work'] },
  { questionId: 'economy-q3', axis: -1, keywords: ['antitrust', 'merger enforcement', 'monopoly'] },
  { questionId: 'economy-q2', axis: -1, keywords: ['antitrust'] },
  { questionId: 'economy-q18', axis: -1, keywords: ['ultra-millionaire', 'wealth tax', 'billionaires income tax', 'buffett rule', 'carried interest'] },
  { questionId: 'economy-q18', axis: 1, keywords: ['death tax repeal', 'estate tax repeal'] },
  { questionId: 'economy-q19', axis: -1, keywords: ['real corporate profits', 'corporate profits minimum tax'] },
  { questionId: 'economy-q19', axis: 1, keywords: ['tcja permanency', 'tax cuts and jobs act permanency'] },
  { questionId: 'economy-q7', axis: 1, keywords: ['balanced budget amendment', 'spending caps', 'cut federal spending'] },
  { questionId: 'economy-q9', axis: 1, keywords: ['balanced budget amendment'] },
  { questionId: 'economy-q6', axis: -1, keywords: ['gig economy', 'portable benefits', 'independent contractor classification'] },
  { questionId: 'economy-q10', axis: -1, keywords: ['unemployment insurance modernization', 'automatic stabilizer'] },
  { questionId: 'economy-q11', axis: -1, keywords: ['too big to fail', 'glass-steagall', 'bank executive accountability', 'clawback'] },
  { questionId: 'economy-q12', axis: -1, keywords: ['glass-steagall'] },
  { questionId: 'economy-q13', axis: -1, keywords: ['financial transaction tax', 'wall street tax'] },
  { questionId: 'economy-q14', axis: -1, keywords: ['payday lend', 'predatory lend'] },
  { questionId: 'economy-q17', axis: -1, keywords: ['non-compete', 'noncompete', 'workforce mobility'] },

  // === Healthcare / social programs ===
  { questionId: 'healthcare-q3', axis: -1, keywords: ['child care for working families', 'universal child care', 'child care access'] },
  { questionId: 'healthcare-q10', axis: -1, keywords: ['paid sick', 'paid family', 'healthy families act', 'family and medical insurance leave'] },
  { questionId: 'healthcare-q11', axis: -1, keywords: ['medicare for all', 'public option', 'medicaid expansion', 'medicare at 50', 'state public option'] },
  { questionId: 'healthcare-q13', axis: -1, keywords: ['affordable insulin', 'capping prescription', 'out-of-pocket'] },
  { questionId: 'healthcare-q12', axis: -1, keywords: ['drug price negotiation', 'negotiate drug prices', 'lower drug costs'] },
  { questionId: 'healthcare-q5', axis: -1, keywords: ['home visiting', 'miechv'] },
  { questionId: 'healthcare-q15', axis: -1, keywords: ['public health infrastructure', 'public health emergency fund'] },
  { questionId: 'healthcare-q4', axis: -1, keywords: ['violence against women'] },
  { questionId: 'healthcare-q9', axis: -1, keywords: ['kinship', 'grandfamilies'] },
  { questionId: 'social-programs-q12', axis: -1, keywords: ['nutrition assistance', 'food assistance'] },
  { questionId: 'social-programs-q15', axis: -1, keywords: ['supplemental nutrition assistance', 'snap benefit', 'closing the meal gap'] },
  { questionId: 'social-programs-q19', axis: -1, keywords: ['school meals', 'child nutrition', 'school lunch', 'summer ebt'] },
  { questionId: 'social-programs-q14', axis: -1, keywords: ['supplemental security income', 'ssi savings penalty', 'disability benefit'] },
  { questionId: 'social-programs-q11', axis: -1, keywords: ['child tax credit', 'cash assistance'] },
  { questionId: 'social-programs-q5', axis: -1, keywords: ['homeless', 'housing first', 'mckinney-vento'] },
  { questionId: 'social-programs-q16', axis: -1, keywords: ['homeless', 'housing first'] },
  { questionId: 'social-programs-q9', axis: -1, keywords: ['lead pipe', 'lead exposure', 'lead-safe', 'healthy homes'] },
  { questionId: 'social-programs-q4', axis: -1, keywords: ['fair housing'] },
  { questionId: 'social-programs-q2', axis: -1, keywords: ['housing voucher', 'housing choice voucher', 'section 8'] },
  { questionId: 'social-programs-q1', axis: -1, keywords: ['affordable housing', 'housing trust fund'] },
  { questionId: 'social-programs-q7', axis: -1, keywords: ['first-time homebuyer', 'downpayment'] },
  { questionId: 'social-programs-q10', axis: -1, keywords: ['rural housing'] },

  // === Civil rights / justice ===
  { questionId: 'civil-rights-q5', axis: -1, keywords: ['equality act', 'nondiscrimination', 'anti-discrimination'] },
  { questionId: 'civil-rights-q9', axis: -1, keywords: ['equality act', 'respect for marriage', 'sexual orientation'] },
  { questionId: 'civil-rights-q9', axis: 1, keywords: ['protection of women and girls in sports'] },
  { questionId: 'civil-rights-q22', axis: -1, keywords: ["women's health protection", 'reproductive freedom', 'reproductive rights', 'right to contraception'] },
  { questionId: 'civil-rights-q22', axis: 1, keywords: ['born-alive', 'pain-capable unborn', 'heartbeat protection', 'life at conception', 'no taxpayer funding for abortion'] },
  { questionId: 'civil-rights-q17', axis: -1, keywords: ['legal aid', 'legal services corporation', 'public defender'] },
  { questionId: 'civil-rights-q10', axis: -1, keywords: ['prison oversight', 'solitary confinement', 'prison reform', 'first step implementation'] },
  { questionId: 'civil-rights-q11', axis: -1, keywords: ['sentencing reform', 'smarter sentencing', 'mandatory minimum reform'] },
  { questionId: 'jud-19', axis: -1, keywords: ['sentencing reform', 'smarter sentencing', 'mandatory minimum reform'] },
  { questionId: 'civil-rights-q14', axis: -1, keywords: ['qualified immunity', 'george floyd justice in policing'] },
  { questionId: 'civil-rights-q14', axis: 1, keywords: ['back the blue'] },
  { questionId: 'civil-rights-q13', axis: -1, keywords: ['body camera', 'body-worn camera'] },
  { questionId: 'civil-rights-q12', axis: -1, keywords: ['no-knock'] },
  { questionId: 'civil-rights-q18', axis: -1, keywords: ['bail reform', 'pretrial integrity'] },
  { questionId: 'civil-rights-q15', axis: -1, keywords: ['expungement', 'clean slate', 'fresh start act'] },
  { questionId: 'civil-rights-q16', axis: -1, keywords: ['asset forfeiture'] },
  { questionId: 'civil-rights-q8', axis: -1, keywords: ['facial recognition'] },
  { questionId: 'civil-rights-q6', axis: -1, keywords: ['hate crime'] },
  { questionId: 'civil-rights-q7', axis: -1, keywords: ['voting rights', 'freedom to vote', 'john r. lewis', 'john lewis voting'] },
  { questionId: 'civil-rights-q7', axis: 1, keywords: ['american confidence in elections', 'safeguard american voter', 'voter id'] },
  { questionId: 'civil-rights-q21', axis: -1, keywords: ['background check'] },
  { questionId: 'civil-rights-q20', axis: -1, keywords: ['sacred site'] },
  { questionId: 'civil-rights-q4', axis: 1, keywords: ['prayer in school', 'religious expression in school'] },
  { questionId: 'civil-rights-q3', axis: 1, keywords: ['faith-based organization', 'religious liberty'] },

  // === Government / democracy ===
  { questionId: 'government-q21', axis: -1, keywords: ['citizens united', 'disclose act', 'democracy for all', 'dark money'] },
  { questionId: 'government-q3', axis: 1, keywords: ['term limits'] },
  { questionId: 'government-q18', axis: 1, keywords: ['regulatory relief', 'reducing regulatory burdens', 'red tape'] },
  { questionId: 'government-q4', axis: -1, keywords: ['lobbying disclosure', 'foreign lobbying'] },
  { questionId: 'government-q12', axis: -1, keywords: ['whistleblower'] },
  { questionId: 'jud-06', axis: 1, keywords: ['regulations from the executive in need of scrutiny', 'separation of powers restoration'] },

  // === Immigration ===
  { questionId: 'immigration-q10', axis: -1, keywords: ['dream act', 'american dream and promise', 'dreamer'] },
  { questionId: 'immigration-q3', axis: -1, keywords: ['refugee admissions', 'refugee protection', 'grace act'] },
  { questionId: 'immigration-q18', axis: -1, keywords: ['refugee'] },
  { questionId: 'immigration-q6', axis: -1, keywords: ['asylum seeker'] },
  { questionId: 'immigration-q9', axis: 1, keywords: ['chain migration', 'merit-based immigration', 'raise act'] },
  { questionId: 'immigration-q15', axis: -1, keywords: ['family reunification'] },
  { questionId: 'immigration-q12', axis: -1, keywords: ['humanitarian parole'] },
  { questionId: 'immigration-q19', axis: -1, keywords: ['detention standards', 'dignity for detained'] },
  { questionId: 'immigration-q11', axis: -1, keywords: ['immigration court'] },
  { questionId: 'immigration-q17', axis: -1, keywords: ['farm workforce modernization'] },
  { questionId: 'immigration-q20', axis: -1, keywords: ['root causes of migration'] },

  // === Defense / foreign policy ===
  { questionId: 'def16', axis: -1, keywords: ['arms control', 'nuclear test ban', 'disarmament'] },
  { questionId: 'def17', axis: 1, keywords: ['nuclear deterrent'] },
  { questionId: 'def2', axis: -1, keywords: ['war powers'] },
  { questionId: 'defense-q3', axis: -1, keywords: ['war powers', 'aumf'] },
  { questionId: 'def14', axis: -1, keywords: ['audit the pentagon', 'people over pentagon'] },
  { questionId: 'defense-q16', axis: -1, keywords: ['arms sale', 'arms export'] },
  { questionId: 'defense-q9', axis: -1, keywords: ['private military contractor', 'contractor accountability'] },
  { questionId: 'defense-q15', axis: -1, keywords: ['foreign assistance', 'global health security'] },
  { questionId: 'defense-q20', axis: -1, keywords: ['paris agreement', 'paris climate'] },

  // === Education ===
  { questionId: 'education-q7', axis: -1, keywords: ['pell grant'] },
  { questionId: 'education-q4', axis: -1, keywords: ['head start', 'early childhood education', 'universal pre-k', 'preschool'] },
  { questionId: 'education-q10', axis: -1, keywords: ['head start', 'universal pre-k', 'preschool'] },
  { questionId: 'education-q3', axis: 1, keywords: ['charter school'] },
  { questionId: 'education-q6', axis: -1, keywords: ['student data privacy', 'student privacy'] },

  // === Technology ===
  { questionId: 'technology-q17', axis: -1, keywords: ['algorithmic accountability', 'algorithmic bias'] },
  { questionId: 'technology-q20', axis: -1, keywords: ['data broker'] },
];

/** Canonical Congress.gov bill-type slugs; anything else (e.g. the known junk
 * `PROC` rows) is excluded from citation generation entirely. */
export const BILL_TYPE_SLUGS: Record<string, string> = {
  HR: 'house-bill',
  S: 'senate-bill',
  HRES: 'house-resolution',
  SRES: 'senate-resolution',
  HJRES: 'house-joint-resolution',
  SJRES: 'senate-joint-resolution',
  HCONRES: 'house-concurrent-resolution',
  SCONRES: 'senate-concurrent-resolution',
};
