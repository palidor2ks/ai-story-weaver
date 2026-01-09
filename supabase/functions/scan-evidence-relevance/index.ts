import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Topic-specific keywords that MUST appear in evidence for it to be relevant
const QUESTION_KEYWORDS: Record<string, string[]> = {
  // Civil Rights
  'civil-rights-q16': ['forfeiture', 'seizure', 'asset', 'property seized', 'civil forfeiture'],
  'civil-rights-q1': ['abortion', 'reproductive', 'roe', 'choice', 'pro-life', 'pro-choice'],
  'civil-rights-q2': ['lgbtq', 'same-sex', 'gay', 'marriage equality', 'transgender'],
  'civil-rights-q3': ['affirmative action', 'racial preference', 'diversity'],
  // Economy
  'economy-q1': ['minimum wage', 'wage increase', 'living wage'],
  'economy-q2': ['tariff', 'trade', 'import', 'export'],
  'economy-q3': ['tax', 'corporate tax', 'tax cut', 'tax increase'],
  // Healthcare
  'health-q1': ['medicare', 'single payer', 'universal healthcare', 'public option'],
  'health-q2': ['drug prices', 'pharmaceutical', 'prescription'],
  // Immigration
  'immigration-q1': ['border', 'wall', 'border security', 'immigration enforcement'],
  'immigration-q2': ['pathway', 'citizenship', 'undocumented', 'amnesty', 'daca'],
  // Environment
  'environment-q1': ['climate', 'carbon', 'emissions', 'paris agreement', 'green new deal'],
  'environment-q2': ['drilling', 'oil', 'fossil fuel', 'fracking'],
  // Defense
  'defense-q1': ['military', 'defense spending', 'pentagon'],
  'defense-q2': ['foreign aid', 'international aid', 'usaid'],
};

function extractCoreKeywords(questionText: string): string[] {
  const text = questionText.toLowerCase();
  
  const commonTerms = [
    'abortion', 'immigration', 'border', 'tax', 'healthcare', 'climate',
    'gun', 'firearm', 'welfare', 'medicare', 'social security', 'minimum wage',
    'forfeiture', 'seizure', 'police', 'military', 'education', 'student loan',
    'marijuana', 'cannabis', 'death penalty', 'capital punishment', 'voting rights',
    'voter id', 'gerrymandering', 'filibuster', 'electoral college', 'supreme court',
    'sanctuary', 'asylum', 'deportation', 'daca', 'dreamers', 'wall',
    'tariff', 'trade', 'nafta', 'tpp', 'china', 'russia', 'nato',
    'nuclear', 'iran', 'israel', 'ukraine', 'afghanistan',
    'oil', 'drilling', 'fracking', 'pipeline', 'keystone', 'solar', 'wind',
    'carbon', 'emissions', 'paris', 'green new deal',
    'lgbtq', 'transgender', 'gay', 'same-sex', 'marriage',
    'discrimination', 'affirmative action', 'civil rights',
    'union', 'collective bargaining', 'right to work',
    'drug', 'opioid', 'pharmaceutical', 'prescription',
  ];
  
  const found = commonTerms.filter(term => text.includes(term));
  
  const words = text.split(/\s+/);
  const additionalKeywords: string[] = [];
  
  for (let i = 0; i < words.length; i++) {
    if (['should', 'federal', 'government', 'limit', 'ban', 'allow', 'require', 'mandate'].includes(words[i])) {
      if (words[i + 1] && words[i + 1].length > 4) {
        additionalKeywords.push(words[i + 1].replace(/[?.,]/g, ''));
      }
    }
  }
  
  return [...new Set([...found, ...additionalKeywords])];
}

function validateEvidenceRelevance(
  questionId: string,
  questionText: string,
  sourceDescription: string | null
): { isRelevant: boolean; flag: string | null } {
  if (!sourceDescription) {
    return { isRelevant: false, flag: null };
  }
  
  const evidenceText = sourceDescription.toLowerCase();
  
  // Skip "no evidence" answers
  if (evidenceText.includes('no documented position') || evidenceText.includes('no evidence found')) {
    return { isRelevant: true, flag: null };
  }
  
  // Get keywords for this specific question, or extract from question text
  const keywords = QUESTION_KEYWORDS[questionId] || extractCoreKeywords(questionText);
  
  if (keywords.length === 0) {
    return { isRelevant: true, flag: null };
  }
  
  const foundKeywords = keywords.filter(kw => evidenceText.includes(kw.toLowerCase()));
  const isRelevant = foundKeywords.length > 0;
  
  return { 
    isRelevant, 
    flag: isRelevant ? null : 'needs_review' 
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { candidateId, limit = 500 } = await req.json().catch(() => ({}));
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Build query
    let query = supabase
      .from('candidate_answers')
      .select('id, candidate_id, question_id, source_description, source_type, confidence, relevance_flag')
      .is('relevance_flag', null) // Only scan unchecked answers
      .neq('source_description', null)
      .order('updated_at', { ascending: false })
      .limit(limit);
    
    if (candidateId) {
      query = query.eq('candidate_id', candidateId);
    }
    
    const { data: answers, error: answersError } = await query;
    
    if (answersError) throw answersError;
    
    if (!answers || answers.length === 0) {
      return new Response(JSON.stringify({ 
        scanned: 0, 
        flagged: 0,
        message: 'No unchecked answers to scan' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Get question texts
    const questionIds = [...new Set(answers.map(a => a.question_id))];
    const { data: questions } = await supabase
      .from('questions')
      .select('id, text')
      .in('id', questionIds);
    
    const questionMap = new Map(questions?.map(q => [q.id, q.text]) || []);
    
    // Validate each answer
    const updates: { id: string; relevance_flag: string }[] = [];
    
    for (const answer of answers) {
      const questionText = questionMap.get(answer.question_id) || '';
      const { isRelevant, flag } = validateEvidenceRelevance(
        answer.question_id,
        questionText,
        answer.source_description
      );
      
      if (!isRelevant && flag) {
        updates.push({ id: answer.id, relevance_flag: flag });
      }
    }
    
    // Batch update flagged answers
    let flaggedCount = 0;
    for (const update of updates) {
      const { error } = await supabase
        .from('candidate_answers')
        .update({ relevance_flag: update.relevance_flag })
        .eq('id', update.id);
      
      if (!error) flaggedCount++;
    }
    
    console.log(`Scanned ${answers.length} answers, flagged ${flaggedCount}`);
    
    return new Response(JSON.stringify({ 
      scanned: answers.length, 
      flagged: flaggedCount,
      message: `Scanned ${answers.length} answers, flagged ${flaggedCount} for review` 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error: unknown) {
    console.error('Scan error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
