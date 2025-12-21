import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONGRESS_API_KEY = Deno.env.get('CONGRESS_GOV_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Expanded mapping of question IDs to keywords
// direction: 1 = bill supports progressive position, -1 = bill opposes progressive position
const questionKeywordMapping: Record<string, { keywords: string[]; direction: number }> = {
  // === CHINA/TAIWAN CONFLICT ===
  'ct2': { keywords: ['china trade', 'tariff', 'economic sanction', 'trade war', 'china economic'], direction: -1 },
  'ct3': { keywords: ['taiwan arm', 'taiwan defense', 'taiwan security', 'arms sale taiwan'], direction: 1 },
  'ct5': { keywords: ['taiwan who', 'taiwan un', 'taiwan recognition', 'taiwan membership'], direction: 1 },
  'ct6': { keywords: ['south china sea', 'indo-pacific', 'pacific fleet', 'china military'], direction: 1 },
  'ct7': { keywords: ['uyghur', 'xinjiang', 'hong kong', 'china sanction', 'human rights china'], direction: 1 },

  // === CIVIL RIGHTS ===
  'cr1': { keywords: ['affirmative action', 'diversity admission', 'race-conscious', 'college admission equity'], direction: 1 },
  'cr2': { keywords: ['lgbtq', 'equality act', 'sexual orientation', 'gender identity', 'gay rights', 'transgender', 'marriage equality'], direction: 1 },

  // === CRIMINAL JUSTICE ===
  'cj3': { keywords: ['private prison', 'for-profit prison', 'prison privatization', 'geo group', 'corecivic'], direction: 1 },
  'cj4': { keywords: ['police reform', 'george floyd', 'police accountability', 'law enforcement reform'], direction: 1 },
  'cj5': { keywords: ['cash bail', 'bail reform', 'pretrial detention', 'end bail'], direction: 1 },
  'cj6': { keywords: ['felon voting', 'voting rights restoration', 'disenfranchise', 'ex-offender vote'], direction: 1 },
  'cj8': { keywords: ['marijuana', 'cannabis', 'decriminalize', 'legalize marijuana', 'more act', 'weed'], direction: 1 },
  'cj9': { keywords: ['civil asset forfeiture', 'asset seizure', 'forfeiture reform'], direction: 1 },
  'cj10': { keywords: ['police misconduct', 'police database', 'officer discipline', 'bad cop'], direction: 1 },
  'cj11': { keywords: ['three strikes', 'three-strikes', 'mandatory minimum', 'sentencing reform'], direction: 1 },
  'cj12': { keywords: ['solitary confinement', 'isolation', 'segregated housing'], direction: 1 },
  'cj13': { keywords: ['juvenile', 'youth offender', 'minor tried', 'young offender'], direction: -1 },
  'cj14': { keywords: ['assault weapon', 'assault-style', 'ar-15', 'high-capacity magazine', 'ban assault'], direction: 1 },
  'cj15': { keywords: ['red flag', 'extreme risk', 'gun violence restraining', 'erpo'], direction: 1 },
  'cj16': { keywords: ['death penalty', 'capital punishment', 'execution', 'lethal injection'], direction: -1 },
  'cj17': { keywords: ['chokehold', 'no-knock', 'use of force', 'police tactic'], direction: 1 },
  'cj18': { keywords: ['forensic', 'forensic science', 'crime lab', 'dna evidence'], direction: 1 },
  'cj19': { keywords: ['predictive policing', 'crime prediction', 'algorithmic policing'], direction: -1 },
  'cj20': { keywords: ['qualified immunity', 'police immunity', 'civil liability'], direction: -1 },
  'cj21': { keywords: ['dna database', 'genealogy', 'genetic privacy', 'dna evidence'], direction: -1 },
  'cj22': { keywords: ['jury duty', 'jury service', 'jury selection'], direction: 1 },
  'cj24': { keywords: ['age of responsibility', 'young adult', 'emerging adult'], direction: 1 },

  // === DOMESTIC POLICY ===
  'dp2': { keywords: ['disaster relief', 'fema', 'emergency management', 'natural disaster'], direction: 1 },
  'dp10': { keywords: ['eminent domain', 'property seizure', 'land acquisition'], direction: -1 },
  'dp12': { keywords: ['factory farm', 'animal agriculture', 'cafo', 'animal welfare'], direction: 1 },
  'dp13': { keywords: ['zoning', 'affordable housing', 'housing development', 'nimby'], direction: 1 },
  'dp14': { keywords: ['public transit', 'bicycle lane', 'bike infrastructure', 'transit funding'], direction: 1 },
  'dp15': { keywords: ['gas tax', 'highway fund', 'infrastructure funding', 'transportation tax'], direction: 1 },
  'dp16': { keywords: ['pbs', 'npr', 'public broadcasting', 'corporation for public'], direction: 1 },
  'dp17': { keywords: ['fairness doctrine', 'broadcast balance', 'media fairness'], direction: 1 },
  'dp18': { keywords: ['rural', 'rural investment', 'rural infrastructure', 'farm community'], direction: 1 },
  'dp19': { keywords: ['pre-k', 'pre-kindergarten', 'early childhood', 'head start'], direction: 1 },

  // === ECONOMY ===
  'econ1': { keywords: ['minimum wage', 'living wage', 'raise the wage', 'fair wage', '$15', 'fifteen dollar'], direction: 1 },
  'econ2': { keywords: ['tax cut', 'tax relief', 'reduce taxes', 'lower taxes'], direction: -1 },
  'econ3': { keywords: ['corporate tax', 'wealth tax', 'tax the rich', 'billionaire tax', 'ultra-millionaire'], direction: 1 },
  'econ4': { keywords: ['universal basic income', 'ubi', 'guaranteed income', 'cash transfer'], direction: 1 },
  'econ5': { keywords: ['labor union', 'collective bargaining', 'pro act', 'worker organizing', 'right to organize'], direction: 1 },
  'econ6': { keywords: ['trade agreement', 'free trade', 'tariff', 'protectionism', 'usmca', 'nafta'], direction: 1 },
  'econ7': { keywords: ['federal reserve', 'monetary policy', 'interest rate', 'central bank'], direction: 0 },
  'econ8': { keywords: ['antitrust', 'monopoly', 'big tech', 'break up', 'market concentration'], direction: 1 },
  'econ9': { keywords: ['gig economy', 'independent contractor', 'uber', 'lyft', 'freelance'], direction: 1 },
  'econ10': { keywords: ['paid leave', 'family leave', 'parental leave', 'sick leave', 'fmla'], direction: 1 },

  // === EDUCATION ===
  'edu1': { keywords: ['student loan', 'college debt', 'tuition-free', 'free college', 'pell grant', 'student debt'], direction: 1 },
  'edu2': { keywords: ['school choice', 'voucher', 'charter school', 'private school'], direction: -1 },
  'edu3': { keywords: ['teacher pay', 'teacher salary', 'educator compensation'], direction: 1 },
  'edu4': { keywords: ['common core', 'education standard', 'curriculum'], direction: 0 },
  'edu5': { keywords: ['trade school', 'vocational', 'apprenticeship', 'career training'], direction: 1 },
  'edu6': { keywords: ['title ix', 'gender equity', 'campus sexual assault', 'sex discrimination'], direction: 1 },

  // === ENVIRONMENT ===
  'env1': { keywords: ['climate change', 'carbon emission', 'greenhouse gas', 'paris agreement', 'clean energy', 'green new deal', 'global warming'], direction: 1 },
  'env2': { keywords: ['environmental protection', 'epa', 'clean air', 'clean water', 'pollution', 'nepa'], direction: 1 },
  'env3': { keywords: ['nuclear power', 'nuclear energy', 'atomic energy', 'nuclear plant'], direction: 0 },
  'env4': { keywords: ['fracking', 'hydraulic fracturing', 'natural gas', 'shale'], direction: -1 },
  'env5': { keywords: ['electric vehicle', 'ev', 'charging station', 'zero emission'], direction: 1 },
  'env6': { keywords: ['carbon tax', 'carbon price', 'cap and trade', 'emissions trading'], direction: 1 },
  'env7': { keywords: ['renewable', 'solar', 'wind energy', 'clean energy', 'green energy'], direction: 1 },
  'env8': { keywords: ['offshore drilling', 'oil drilling', 'arctic drilling', 'fossil fuel'], direction: -1 },
  'env9': { keywords: ['endangered species', 'wildlife protection', 'biodiversity', 'habitat'], direction: 1 },
  'env10': { keywords: ['plastic ban', 'single-use plastic', 'plastic pollution'], direction: 1 },

  // === FOREIGN POLICY ===
  'fp1': { keywords: ['nato', 'european alliance', 'atlantic treaty'], direction: 1 },
  'fp2': { keywords: ['united nations', 'un funding', 'multilateral', 'international organization'], direction: 1 },
  'fp3': { keywords: ['foreign aid', 'international development', 'usaid', 'overseas assistance'], direction: 1 },
  'fp4': { keywords: ['israel', 'israeli', 'iron dome', 'palestinian'], direction: 0 },
  'fp5': { keywords: ['iran deal', 'jcpoa', 'iran nuclear', 'iran sanction'], direction: 1 },
  'fp6': { keywords: ['cuba', 'embargo', 'cuban', 'havana'], direction: 1 },
  'fp7': { keywords: ['russia sanction', 'putin', 'nord stream', 'ukraine aid'], direction: 1 },
  'fp8': { keywords: ['afghanistan', 'troop withdrawal', 'endless war', 'iraq war'], direction: 1 },

  // === GOVERNMENT REFORM ===
  'gr1': { keywords: ['term limit', 'congressional term', 'limit terms'], direction: 1 },
  'gr2': { keywords: ['electoral college', 'popular vote', 'national popular'], direction: 1 },
  'gr3': { keywords: ['statehood', 'puerto rico', 'dc statehood', 'washington dc'], direction: 1 },
  'gr4': { keywords: ['supreme court', 'pack the court', 'court reform', 'court expansion'], direction: 1 },
  'gr5': { keywords: ['filibuster', 'senate rule', 'cloture', 'sixty vote'], direction: 1 },
  'gr6': { keywords: ['gerrymandering', 'redistricting', 'fair maps', 'voting district'], direction: 1 },
  'gr7': { keywords: ['citizens united', 'campaign finance', 'money in politics', 'dark money', 'pac'], direction: 1 },
  'gr8': { keywords: ['voter id', 'voter identification', 'election integrity'], direction: -1 },
  'gr9': { keywords: ['voting access', 'voting rights act', 'election day', 'vote by mail', 'early voting'], direction: 1 },

  // === GUNS ===
  'gun1': { keywords: ['background check', 'universal background', 'gun purchase', 'firearm sale', 'brady'], direction: 1 },
  'gun2': { keywords: ['assault weapon', 'assault-style', 'assault rifle', 'ar-15', 'high-capacity magazine', 'ban assault'], direction: 1 },
  'gun3': { keywords: ['gun show', 'loophole', 'private sale', 'unlicensed seller'], direction: 1 },
  'gun4': { keywords: ['concealed carry', 'national reciprocity', 'gun permit', 'carry permit'], direction: -1 },
  'gun5': { keywords: ['gun manufacturer', 'firearm liability', 'sue gun maker', 'plcaa'], direction: 1 },
  'gun6': { keywords: ['waiting period', 'cooling off', 'gun waiting'], direction: 1 },

  // === HEALTHCARE ===
  'health1': { keywords: ['medicare for all', 'single-payer', 'universal healthcare', 'public option', 'expand medicare'], direction: 1 },
  'health2': { keywords: ['affordable care act', 'obamacare', 'aca', 'health insurance', 'pre-existing condition'], direction: 1 },
  'health3': { keywords: ['drug price', 'prescription drug', 'pharma', 'insulin', 'negotiate drug'], direction: 1 },
  'health4': { keywords: ['mental health', 'behavioral health', 'mental illness', 'suicide prevention'], direction: 1 },
  'health5': { keywords: ['abortion', 'reproductive rights', 'roe v wade', 'pro-choice', 'women\'s health', 'reproductive health'], direction: 1 },
  'health6': { keywords: ['medicaid', 'medicaid expansion', 'low-income health'], direction: 1 },
  'health7': { keywords: ['vaccine', 'vaccination', 'immunization', 'vaccine mandate'], direction: 1 },
  'health8': { keywords: ['opioid', 'drug addiction', 'substance abuse', 'overdose', 'fentanyl'], direction: 1 },

  // === IMMIGRATION ===
  'imm1': { keywords: ['border wall', 'border barrier', 'border security', 'secure the border'], direction: -1 },
  'imm2': { keywords: ['pathway to citizenship', 'dream act', 'daca', 'dreamer', 'immigration reform', 'legalization'], direction: 1 },
  'imm3': { keywords: ['sanctuary city', 'sanctuary state', 'ice cooperation', 'local enforcement'], direction: 1 },
  'imm4': { keywords: ['h-1b', 'skilled worker', 'work visa', 'employment visa'], direction: 1 },
  'imm5': { keywords: ['family separation', 'child detention', 'border children', 'migrant family'], direction: 1 },
  'imm6': { keywords: ['asylum', 'refugee', 'asylum seeker', 'refugee cap'], direction: 1 },
  'imm7': { keywords: ['deportation', 'ice', 'immigration enforcement', 'removal'], direction: -1 },
  'imm8': { keywords: ['e-verify', 'employment verification', 'hire illegal'], direction: -1 },

  // === SOCIAL SECURITY ===
  'ss1': { keywords: ['social security', 'protect social security', 'expand social security', 'fica', 'retirement age'], direction: 1 },
  'ss2': { keywords: ['medicare', 'medicare benefit', 'senior health', 'part d'], direction: 1 },
  'ss3': { keywords: ['pension', 'retirement security', '401k', 'retirement savings'], direction: 1 },

  // === TECH ===
  'tech1': { keywords: ['section 230', 'platform liability', 'social media regulation', 'content moderation'], direction: 1 },
  'tech2': { keywords: ['net neutrality', 'internet service', 'isp', 'broadband'], direction: 1 },
  'tech3': { keywords: ['data privacy', 'consumer privacy', 'personal data', 'gdpr', 'ccpa'], direction: 1 },
  'tech4': { keywords: ['artificial intelligence', 'ai regulation', 'algorithm', 'facial recognition'], direction: 1 },
  'tech5': { keywords: ['cryptocurrency', 'bitcoin', 'digital currency', 'crypto regulation'], direction: 0 },
  'tech6': { keywords: ['broadband access', 'rural broadband', 'internet access', 'digital divide'], direction: 1 },

  // === DEFENSE ===
  'defense1': { keywords: ['defense spending', 'military budget', 'pentagon', 'national defense', 'ndaa'], direction: -1 },
  'defense2': { keywords: ['veteran', 'va', 'veteran affairs', 'military benefit'], direction: 1 },
  'defense3': { keywords: ['nuclear weapon', 'nuclear arsenal', 'arms control', 'nuclear treaty'], direction: 1 },

  // === HOUSING ===
  'housing1': { keywords: ['affordable housing', 'housing subsidy', 'section 8', 'public housing'], direction: 1 },
  'housing2': { keywords: ['rent control', 'tenant protection', 'eviction', 'renter rights'], direction: 1 },
  'housing3': { keywords: ['homelessness', 'homeless', 'unhoused', 'housing first'], direction: 1 },
  'housing4': { keywords: ['first-time homebuyer', 'down payment assistance', 'homeownership'], direction: 1 },
};

// Policy area to topic mapping
const policyAreaToTopic: Record<string, string> = {
  'Health': 'healthcare',
  'Armed Forces and National Security': 'defense',
  'Crime and Law Enforcement': 'criminal_justice',
  'Economics and Public Finance': 'economy',
  'Education': 'education',
  'Energy': 'environment',
  'Environmental Protection': 'environment',
  'Immigration': 'immigration',
  'Taxation': 'economy',
  'Social Welfare': 'social_security',
  'Civil Rights and Liberties, Minority Issues': 'civil_rights',
  'International Affairs': 'foreign_policy',
  'Labor and Employment': 'economy',
  'Commerce': 'economy',
  'Finance and Financial Sector': 'economy',
  'Science, Technology, Communications': 'tech',
  'Housing and Community Development': 'housing',
  'Government Operations and Politics': 'government_reform',
  'Public Lands and Natural Resources': 'environment',
};

interface LegislationItem {
  congress: number;
  latestAction?: { actionDate: string; text: string };
  number: string;
  originChamber: string;
  originChamberCode: string;
  title: string;
  type: string;
  url: string;
  policyArea?: { name: string };
}

interface CandidateAnswer {
  candidate_id: string;
  question_id: string;
  answer_value: number;
  source_type: string;
  source_url: string;
  source_description: string;
  confidence: string;
}

function matchBillToQuestions(bill: LegislationItem): { questionId: string; direction: number }[] {
  const matches: { questionId: string; direction: number }[] = [];
  
  const titleLower = (bill.title || '').toLowerCase();
  const policyArea = (bill.policyArea?.name || '').toLowerCase();

  for (const [questionId, config] of Object.entries(questionKeywordMapping)) {
    for (const keyword of config.keywords) {
      const keywordLower = keyword.toLowerCase();
      if (titleLower.includes(keywordLower) || policyArea.includes(keywordLower)) {
        matches.push({ questionId, direction: config.direction });
        break;
      }
    }
  }

  return matches;
}

function calculateAnswerValue(actionType: 'sponsored' | 'cosponsored' | 'yea' | 'nay', direction: number): number {
  const baseValue = direction > 0 ? 1 : -1;
  
  switch (actionType) {
    case 'sponsored':
      return baseValue * 10;
    case 'cosponsored':
      return baseValue * 7;
    case 'yea':
      return baseValue * 10;
    case 'nay':
      return baseValue * -10;
    default:
      return 0;
  }
}

function generateSourceUrl(bill: LegislationItem): string {
  const congress = bill.congress;
  const type = bill.type.toLowerCase();
  const number = bill.number;
  return `https://www.congress.gov/bill/${congress}th-congress/${type}/${number}`;
}

function determineConfidence(actionType: string, matchStrength: 'exact' | 'keyword'): string {
  if (actionType === 'sponsored' && matchStrength === 'exact') return 'high';
  if (actionType === 'sponsored' || actionType === 'cosponsored') return 'medium';
  return 'low';
}

// Helper to add delay between API calls
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bioguideId, processAll, batchSize = 10 } = await req.json();
    
    console.log(`Starting populate-candidate-answers for: ${bioguideId || 'batch processing'}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let candidatesToProcess: { id: string; name: string }[] = [];
    
    if (bioguideId) {
      const { data: candidate } = await supabase
        .from('candidates')
        .select('id, name')
        .eq('id', bioguideId)
        .single();
      
      if (candidate) {
        candidatesToProcess = [candidate];
      } else {
        console.log(`Candidate ${bioguideId} not found in database`);
        candidatesToProcess = [{ id: bioguideId, name: bioguideId }];
      }
    } else if (processAll) {
      // Get candidates that need sync (never synced or older than 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const { data: candidates } = await supabase
        .from('candidates')
        .select('id, name')
        .or(`last_answers_sync.is.null,last_answers_sync.lt.${sevenDaysAgo.toISOString()}`)
        .order('last_answers_sync', { ascending: true, nullsFirst: true })
        .limit(batchSize);
      
      candidatesToProcess = candidates || [];
    } else {
      return new Response(
        JSON.stringify({ error: 'Must provide bioguideId or processAll flag' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${candidatesToProcess.length} candidates`);

    const { data: questions } = await supabase
      .from('questions')
      .select('id, text, topic_id');
    
    const questionMap = new Map(questions?.map(q => [q.id, q]) || []);
    console.log(`Loaded ${questionMap.size} questions, mapping covers ${Object.keys(questionKeywordMapping).length} questions`);

    const results: { candidate: string; answersCreated: number; errors: string[] }[] = [];

    for (const candidate of candidatesToProcess) {
      const candidateResults = { candidate: candidate.name, answersCreated: 0, errors: [] as string[] };
      const answersToUpsert: CandidateAnswer[] = [];
      
      try {
        // Add delay between candidates to avoid rate limiting
        await delay(500);
        
        // Fetch sponsored legislation
        console.log(`Fetching sponsored legislation for ${candidate.id}`);
        const sponsoredUrl = `https://api.congress.gov/v3/member/${candidate.id}/sponsored-legislation?api_key=${CONGRESS_API_KEY}&limit=250`;
        const sponsoredResponse = await fetch(sponsoredUrl);
        
        if (!sponsoredResponse.ok) {
          candidateResults.errors.push(`Failed to fetch sponsored legislation: ${sponsoredResponse.status}`);
        } else {
          const sponsoredData = await sponsoredResponse.json();
          const sponsoredLegislation: LegislationItem[] = sponsoredData.sponsoredLegislation || [];
          console.log(`Found ${sponsoredLegislation.length} sponsored bills`);
          
          for (const bill of sponsoredLegislation) {
            const matches = matchBillToQuestions(bill);
            for (const match of matches) {
              if (questionMap.has(match.questionId)) {
                answersToUpsert.push({
                  candidate_id: candidate.id,
                  question_id: match.questionId,
                  answer_value: calculateAnswerValue('sponsored', match.direction),
                  source_type: 'legislation',
                  source_url: generateSourceUrl(bill),
                  source_description: `Sponsored: ${bill.title || 'Unknown bill'}`,
                  confidence: 'high',
                });
              }
            }
          }
        }

        // Small delay between API calls
        await delay(300);

        // Fetch cosponsored legislation
        console.log(`Fetching cosponsored legislation for ${candidate.id}`);
        const cosponsoredUrl = `https://api.congress.gov/v3/member/${candidate.id}/cosponsored-legislation?api_key=${CONGRESS_API_KEY}&limit=250`;
        const cosponsoredResponse = await fetch(cosponsoredUrl);
        
        if (!cosponsoredResponse.ok) {
          candidateResults.errors.push(`Failed to fetch cosponsored legislation: ${cosponsoredResponse.status}`);
        } else {
          const cosponsoredData = await cosponsoredResponse.json();
          const cosponsoredLegislation: LegislationItem[] = cosponsoredData.cosponsoredLegislation || [];
          console.log(`Found ${cosponsoredLegislation.length} cosponsored bills`);
          
          for (const bill of cosponsoredLegislation) {
            const matches = matchBillToQuestions(bill);
            for (const match of matches) {
              const existingAnswer = answersToUpsert.find(
                a => a.candidate_id === candidate.id && a.question_id === match.questionId
              );
              
              if (!existingAnswer && questionMap.has(match.questionId)) {
                answersToUpsert.push({
                  candidate_id: candidate.id,
                  question_id: match.questionId,
                  answer_value: calculateAnswerValue('cosponsored', match.direction),
                  source_type: 'legislation',
                  source_url: generateSourceUrl(bill),
                  source_description: `Cosponsored: ${bill.title || 'Unknown bill'}`,
                  confidence: 'medium',
                });
              }
            }
          }
        }

        // Upsert answers to database
        if (answersToUpsert.length > 0) {
          console.log(`Upserting ${answersToUpsert.length} answers for ${candidate.name}`);
          
          for (const answer of answersToUpsert) {
            const { error } = await supabase
              .from('candidate_answers')
              .upsert(answer, { 
                onConflict: 'candidate_id,question_id',
                ignoreDuplicates: false 
              });
            
            if (error) {
              console.error(`Error upserting answer: ${error.message}`);
              candidateResults.errors.push(`Failed to upsert answer for ${answer.question_id}: ${error.message}`);
            } else {
              candidateResults.answersCreated++;
            }
          }
        }

        // Update last_answers_sync timestamp
        await supabase
          .from('candidates')
          .update({ last_answers_sync: new Date().toISOString() })
          .eq('id', candidate.id);

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        candidateResults.errors.push(errorMessage);
        console.error(`Error processing ${candidate.name}: ${errorMessage}`);
      }

      results.push(candidateResults);
    }

    const totalAnswers = results.reduce((sum, r) => sum + r.answersCreated, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

    // Get remaining count for progress tracking
    const { count: remainingCount } = await supabase
      .from('candidates')
      .select('id', { count: 'exact', head: true })
      .is('last_answers_sync', null);

    console.log(`Completed. Answers: ${totalAnswers}, Errors: ${totalErrors}, Remaining: ${remainingCount}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        summary: {
          candidatesProcessed: results.length,
          totalAnswersCreated: totalAnswers,
          totalErrors: totalErrors,
          remainingCandidates: remainingCount || 0,
        },
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in populate-candidate-answers:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
