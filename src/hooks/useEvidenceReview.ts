import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface FlaggedAnswer {
  id: string;
  candidate_id: string;
  question_id: string;
  answer_value: number;
  confidence: string | null;
  source_description: string | null;
  source_type: string | null;
  source_url: string | null;
  relevance_flag: string | null;
  updated_at: string;
  // Joined data
  candidate_name?: string;
  candidate_party?: string;
  question_text?: string;
  topic_name?: string;
}

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

export function extractCoreKeywords(questionText: string): string[] {
  // Extract important nouns and phrases from question text
  const text = questionText.toLowerCase();
  
  // Common political terms to look for
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
  
  // Also extract key noun phrases using simple patterns
  const words = text.split(/\s+/);
  const additionalKeywords: string[] = [];
  
  // Look for words after "should", "federal", "government", etc.
  for (let i = 0; i < words.length; i++) {
    if (['should', 'federal', 'government', 'limit', 'ban', 'allow', 'require', 'mandate'].includes(words[i])) {
      if (words[i + 1] && words[i + 1].length > 4) {
        additionalKeywords.push(words[i + 1].replace(/[?.,]/g, ''));
      }
    }
  }
  
  return [...new Set([...found, ...additionalKeywords])];
}

export function validateEvidenceRelevance(
  questionId: string,
  questionText: string,
  sourceDescription: string | null
): { isRelevant: boolean; missingKeywords: string[]; foundKeywords: string[] } {
  if (!sourceDescription) {
    return { isRelevant: false, missingKeywords: [], foundKeywords: [] };
  }
  
  const evidenceText = sourceDescription.toLowerCase();
  
  // Check if it's a "no evidence" answer
  if (evidenceText.includes('no documented position') || evidenceText.includes('no evidence found')) {
    return { isRelevant: true, missingKeywords: [], foundKeywords: [] }; // N/A - no evidence to validate
  }
  
  // Get keywords for this specific question, or extract from question text
  const keywords = QUESTION_KEYWORDS[questionId] || extractCoreKeywords(questionText);
  
  if (keywords.length === 0) {
    return { isRelevant: true, missingKeywords: [], foundKeywords: [] }; // Can't validate without keywords
  }
  
  const foundKeywords = keywords.filter(kw => evidenceText.includes(kw.toLowerCase()));
  const missingKeywords = keywords.filter(kw => !evidenceText.includes(kw.toLowerCase()));
  
  // At least one keyword must be present for relevance
  const isRelevant = foundKeywords.length > 0;
  
  return { isRelevant, missingKeywords, foundKeywords };
}

export function useFlaggedAnswers() {
  return useQuery({
    queryKey: ['flagged-answers'],
    queryFn: async (): Promise<FlaggedAnswer[]> => {
      // Get flagged answers with candidate and question info
      const { data: answers, error: answersError } = await supabase
        .from('candidate_answers')
        .select('id, candidate_id, question_id, answer_value, confidence, source_description, source_type, source_url, relevance_flag, updated_at')
        .in('relevance_flag', ['mismatch', 'needs_review'])
        .order('updated_at', { ascending: false })
        .limit(100);
      
      if (answersError) throw answersError;
      if (!answers || answers.length === 0) return [];
      
      // Get candidate info
      const candidateIds = [...new Set(answers.map(a => a.candidate_id))];
      const { data: candidates } = await supabase
        .from('candidates')
        .select('id, name, party')
        .in('id', candidateIds);
      
      const candidateMap = new Map(candidates?.map(c => [c.id, c]) || []);
      
      // Get question info
      const questionIds = [...new Set(answers.map(a => a.question_id))];
      const { data: questions } = await supabase
        .from('questions')
        .select('id, text, topic_id')
        .in('id', questionIds);
      
      const questionMap = new Map(questions?.map(q => [q.id, q]) || []);
      
      // Get topic info
      const topicIds = [...new Set(questions?.map(q => q.topic_id) || [])];
      const { data: topics } = await supabase
        .from('topics')
        .select('id, name')
        .in('id', topicIds);
      
      const topicMap = new Map(topics?.map(t => [t.id, t]) || []);
      
      // Combine data
      return answers.map(a => {
        const candidate = candidateMap.get(a.candidate_id);
        const question = questionMap.get(a.question_id);
        const topic = question ? topicMap.get(question.topic_id) : null;
        
        return {
          ...a,
          candidate_name: candidate?.name,
          candidate_party: candidate?.party,
          question_text: question?.text,
          topic_name: topic?.name,
        };
      });
    },
    staleTime: 30000,
  });
}

export function useUpdateRelevanceFlag() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ answerId, flag }: { answerId: string; flag: string | null }) => {
      const { error } = await supabase
        .from('candidate_answers')
        .update({ relevance_flag: flag })
        .eq('id', answerId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flagged-answers'] });
      toast.success('Answer status updated');
    },
    onError: (error) => {
      toast.error('Failed to update: ' + error.message);
    },
  });
}

export function useScanEvidenceRelevance() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (options?: { candidateId?: string; limit?: number }) => {
      const response = await supabase.functions.invoke('scan-evidence-relevance', {
        body: options || {},
      });
      
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['flagged-answers'] });
      toast.success(`Scan complete: ${data.flagged} answers flagged for review`);
    },
    onError: (error) => {
      toast.error('Scan failed: ' + error.message);
    },
  });
}
