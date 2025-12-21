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

// Mapping of question IDs to keywords that indicate support for that position
// Positive keywords = sponsoring/voting for bill means answer_value > 0
// The value indicates if the bill SUPPORTS (+1) or OPPOSES (-1) the progressive position
const questionKeywordMapping: Record<string, { keywords: string[]; direction: number }> = {
  'gun1': { 
    keywords: ['background check', 'universal background', 'gun purchase', 'firearm sale', 'brady'],
    direction: 1 // Supporting these bills = pro-regulation
  },
  'gun2': { 
    keywords: ['assault weapon', 'assault-style', 'assault rifle', 'ar-15', 'high-capacity magazine', 'ban assault'],
    direction: 1
  },
  'health1': { 
    keywords: ['medicare for all', 'single-payer', 'universal healthcare', 'public option', 'expand medicare'],
    direction: 1
  },
  'health2': { 
    keywords: ['affordable care act', 'obamacare', 'aca', 'health insurance', 'pre-existing condition'],
    direction: 1
  },
  'imm1': { 
    keywords: ['border wall', 'border barrier', 'border security', 'secure the border'],
    direction: -1 // Supporting border wall = anti-immigration position
  },
  'imm2': { 
    keywords: ['pathway to citizenship', 'dream act', 'daca', 'dreamer', 'immigration reform', 'legalization'],
    direction: 1
  },
  'env1': { 
    keywords: ['climate change', 'carbon emission', 'greenhouse gas', 'paris agreement', 'clean energy', 'green new deal'],
    direction: 1
  },
  'env2': { 
    keywords: ['environmental protection', 'epa', 'clean air', 'clean water', 'pollution'],
    direction: 1
  },
  'econ1': { 
    keywords: ['minimum wage', 'living wage', 'raise the wage', 'fair wage'],
    direction: 1
  },
  'econ2': { 
    keywords: ['tax cut', 'tax relief', 'reduce taxes', 'lower taxes', 'tax reform'],
    direction: -1 // Tax cuts generally = conservative position
  },
  'econ3': { 
    keywords: ['corporate tax', 'wealth tax', 'tax the rich', 'billionaire tax'],
    direction: 1
  },
  'edu1': { 
    keywords: ['student loan', 'college debt', 'tuition-free', 'free college', 'pell grant'],
    direction: 1
  },
  'edu2': { 
    keywords: ['school choice', 'voucher', 'charter school'],
    direction: -1
  },
  'crime1': { 
    keywords: ['police reform', 'criminal justice reform', 'sentencing reform', 'prison reform'],
    direction: 1
  },
  'crime2': { 
    keywords: ['back the blue', 'support police', 'fund the police', 'law enforcement funding'],
    direction: -1
  },
  'rights1': { 
    keywords: ['abortion', 'reproductive rights', 'roe v wade', 'pro-choice', 'women\'s health'],
    direction: 1
  },
  'rights2': { 
    keywords: ['lgbtq', 'marriage equality', 'equality act', 'transgender', 'gay rights'],
    direction: 1
  },
  'trade1': { 
    keywords: ['free trade', 'trade agreement', 'tariff reduction', 'usmca', 'tpp'],
    direction: 1
  },
  'defense1': { 
    keywords: ['defense spending', 'military budget', 'pentagon', 'national defense'],
    direction: -1 // Increasing military = conservative
  },
  'social1': { 
    keywords: ['social security', 'protect social security', 'expand social security'],
    direction: 1
  },
};

// Policy area to topic mapping
const policyAreaToTopic: Record<string, string> = {
  'Health': 'healthcare',
  'Armed Forces and National Security': 'defense',
  'Crime and Law Enforcement': 'crime',
  'Economics and Public Finance': 'economy',
  'Education': 'education',
  'Energy': 'environment',
  'Environmental Protection': 'environment',
  'Immigration': 'immigration',
  'Taxation': 'economy',
  'Social Welfare': 'social',
  'Civil Rights and Liberties, Minority Issues': 'rights',
  'International Affairs': 'foreign_policy',
  'Labor and Employment': 'economy',
  'Commerce': 'economy',
  'Finance and Financial Sector': 'economy',
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
  const titleLower = bill.title.toLowerCase();
  const policyArea = bill.policyArea?.name?.toLowerCase() || '';

  for (const [questionId, config] of Object.entries(questionKeywordMapping)) {
    for (const keyword of config.keywords) {
      if (titleLower.includes(keyword.toLowerCase()) || policyArea.includes(keyword.toLowerCase())) {
        matches.push({ questionId, direction: config.direction });
        break; // Only match each question once per bill
      }
    }
  }

  return matches;
}

function calculateAnswerValue(actionType: 'sponsored' | 'cosponsored' | 'yea' | 'nay', direction: number): number {
  // direction: 1 means bill supports progressive position, -1 means it opposes
  // actionType determines strength of support/opposition
  
  const baseValue = direction > 0 ? 1 : -1;
  
  switch (actionType) {
    case 'sponsored':
      return baseValue * 10; // Strongest signal
    case 'cosponsored':
      return baseValue * 7; // Strong signal
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bioguideId, processAll } = await req.json();
    
    console.log(`Starting populate-candidate-answers for: ${bioguideId || 'all candidates'}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get candidates to process
    let candidatesToProcess: { id: string; name: string }[] = [];
    
    if (bioguideId) {
      // Check if this bioguideId exists in our candidates table
      const { data: candidate } = await supabase
        .from('candidates')
        .select('id, name')
        .eq('id', bioguideId)
        .single();
      
      if (candidate) {
        candidatesToProcess = [candidate];
      } else {
        // Try to find by partial match or name
        console.log(`Candidate ${bioguideId} not found in database, will create answers anyway`);
        candidatesToProcess = [{ id: bioguideId, name: bioguideId }];
      }
    } else if (processAll) {
      const { data: candidates } = await supabase
        .from('candidates')
        .select('id, name')
        .limit(50); // Limit batch size
      
      candidatesToProcess = candidates || [];
    } else {
      return new Response(
        JSON.stringify({ error: 'Must provide bioguideId or processAll flag' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all questions from database
    const { data: questions } = await supabase
      .from('questions')
      .select('id, text, topic_id');
    
    const questionMap = new Map(questions?.map(q => [q.id, q]) || []);
    console.log(`Loaded ${questionMap.size} questions from database`);

    const results: { candidate: string; answersCreated: number; errors: string[] }[] = [];

    for (const candidate of candidatesToProcess) {
      const candidateResults = { candidate: candidate.name, answersCreated: 0, errors: [] as string[] };
      const answersToUpsert: CandidateAnswer[] = [];
      
      try {
        // Fetch sponsored legislation
        console.log(`Fetching sponsored legislation for ${candidate.id}`);
        const sponsoredUrl = `https://api.congress.gov/v3/member/${candidate.id}/sponsored-legislation?api_key=${CONGRESS_API_KEY}&limit=100`;
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
                  source_type: 'voting_record',
                  source_url: generateSourceUrl(bill),
                  source_description: `Sponsored: ${bill.title}`,
                  confidence: 'high',
                });
              }
            }
          }
        }

        // Fetch cosponsored legislation
        console.log(`Fetching cosponsored legislation for ${candidate.id}`);
        const cosponsoredUrl = `https://api.congress.gov/v3/member/${candidate.id}/cosponsored-legislation?api_key=${CONGRESS_API_KEY}&limit=100`;
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
              // Only add if we don't already have a sponsored answer for this question
              const existingAnswer = answersToUpsert.find(
                a => a.candidate_id === candidate.id && a.question_id === match.questionId
              );
              
              if (!existingAnswer && questionMap.has(match.questionId)) {
                answersToUpsert.push({
                  candidate_id: candidate.id,
                  question_id: match.questionId,
                  answer_value: calculateAnswerValue('cosponsored', match.direction),
                  source_type: 'cosponsorship',
                  source_url: generateSourceUrl(bill),
                  source_description: `Cosponsored: ${bill.title}`,
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

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        candidateResults.errors.push(errorMessage);
        console.error(`Error processing ${candidate.name}: ${errorMessage}`);
      }

      results.push(candidateResults);
    }

    const totalAnswers = results.reduce((sum, r) => sum + r.answersCreated, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

    console.log(`Completed. Total answers created: ${totalAnswers}, Total errors: ${totalErrors}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        summary: {
          candidatesProcessed: results.length,
          totalAnswersCreated: totalAnswers,
          totalErrors: totalErrors,
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
