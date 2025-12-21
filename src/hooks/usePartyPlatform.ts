import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PartyPlatform {
  id: string;
  name: string;
  short_name: string;
  color: string;
  description: string | null;
  website_url: string | null;
  logo_icon: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartyAnswer {
  id: string;
  party_id: string;
  question_id: string;
  answer_value: number;
  source_url: string | null;
  source_description: string | null;
  confidence: string | null;
  notes: string | null;
  question?: {
    id: string;
    text: string;
    topic_id: string;
    topics?: {
      id: string;
      name: string;
      icon: string;
    };
  };
  question_options?: {
    id: string;
    text: string;
    value: number;
  }[];
}

export interface PartyWithAnswers extends PartyPlatform {
  answers: PartyAnswer[];
  topicScores: { topicId: string; topicName: string; score: number; answerCount: number }[];
  overallScore: number;
}

// Fetch all parties
export function useParties() {
  return useQuery({
    queryKey: ['party-platforms'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('party_platforms')
        .select('*')
        .order('id');
      
      if (error) throw error;
      return data as PartyPlatform[];
    },
  });
}

// Fetch a single party with all answers
export function usePartyPlatform(partyId: string | undefined) {
  return useQuery({
    queryKey: ['party-platform', partyId],
    queryFn: async () => {
      if (!partyId) throw new Error('Party ID required');

      // Fetch party details
      const { data: party, error: partyError } = await supabase
        .from('party_platforms')
        .select('*')
        .eq('id', partyId)
        .maybeSingle();
      
      if (partyError) throw partyError;
      if (!party) throw new Error('Party not found');

      // Fetch party answers with questions and options
      const { data: answers, error: answersError } = await supabase
        .from('party_answers')
        .select(`
          *,
          question:questions(
            id,
            text,
            topic_id,
            topics(id, name, icon)
          )
        `)
        .eq('party_id', partyId);
      
      if (answersError) throw answersError;

      // Fetch question options for these questions
      const questionIds = (answers || []).map(a => a.question_id);
      const { data: options } = await supabase
        .from('question_options')
        .select('*')
        .in('question_id', questionIds);

      // Attach options to answers
      const answersWithOptions = (answers || []).map(answer => ({
        ...answer,
        question_options: (options || []).filter(o => o.question_id === answer.question_id),
      }));

      // Calculate topic scores
      const topicScoresMap: Record<string, { total: number; count: number; name: string }> = {};
      answersWithOptions.forEach(answer => {
        const topicId = answer.question?.topic_id;
        const topicName = answer.question?.topics?.name;
        if (topicId && topicName) {
          if (!topicScoresMap[topicId]) {
            topicScoresMap[topicId] = { total: 0, count: 0, name: topicName };
          }
          topicScoresMap[topicId].total += answer.answer_value;
          topicScoresMap[topicId].count += 1;
        }
      });

      const topicScores = Object.entries(topicScoresMap).map(([topicId, data]) => ({
        topicId,
        topicName: data.name,
        score: data.count > 0 ? data.total / data.count : 0,
        answerCount: data.count,
      }));

      // Calculate overall score
      const totalAnswers = answersWithOptions.length;
      const totalScore = answersWithOptions.reduce((sum, a) => sum + a.answer_value, 0);
      const overallScore = totalAnswers > 0 ? totalScore / totalAnswers : 0;

      return {
        ...party,
        answers: answersWithOptions,
        topicScores,
        overallScore,
      } as PartyWithAnswers;
    },
    enabled: !!partyId,
  });
}

// Fetch all parties with basic stats
export function usePartiesWithStats() {
  return useQuery({
    queryKey: ['parties-with-stats'],
    queryFn: async () => {
      // Fetch all parties
      const { data: parties, error: partiesError } = await supabase
        .from('party_platforms')
        .select('*')
        .order('id');
      
      if (partiesError) throw partiesError;

      // Fetch answer counts per party
      const { data: answerCounts, error: countsError } = await supabase
        .from('party_answers')
        .select('party_id, answer_value');
      
      if (countsError) throw countsError;

      // Calculate stats for each party
      const partiesWithStats = (parties || []).map(party => {
        const partyAnswers = (answerCounts || []).filter(a => a.party_id === party.id);
        const totalScore = partyAnswers.reduce((sum, a) => sum + a.answer_value, 0);
        const overallScore = partyAnswers.length > 0 ? totalScore / partyAnswers.length : 0;
        
        return {
          ...party,
          answerCount: partyAnswers.length,
          overallScore,
        };
      });

      return partiesWithStats;
    },
  });
}

// Calculate user alignment with a party
export function calculatePartyAlignment(
  userScores: { topicId: string; score: number }[],
  partyScores: { topicId: string; score: number }[]
): number {
  if (userScores.length === 0 || partyScores.length === 0) return 50;

  const partyScoreMap = new Map(partyScores.map(s => [s.topicId, s.score]));
  
  let totalMatch = 0;
  let count = 0;

  for (const userScore of userScores) {
    const partyScore = partyScoreMap.get(userScore.topicId);
    if (partyScore !== undefined) {
      const diff = Math.abs(userScore.score - partyScore);
      const maxDiff = 20; // -10 to +10 range
      const match = Math.max(0, 100 - (diff / maxDiff) * 100);
      totalMatch += match;
      count++;
    }
  }

  return count > 0 ? Math.round(totalMatch / count) : 50;
}
