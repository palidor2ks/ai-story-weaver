import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PartyAnswerStats {
  partyId: string;
  partyName: string;
  answerCount: number;
  totalQuestions: number;
  percentage: number;
}

const PARTIES = [
  { id: 'democrat', name: 'Democratic Party' },
  { id: 'republican', name: 'Republican Party' },
  { id: 'green', name: 'Green Party' },
  { id: 'libertarian', name: 'Libertarian Party' },
];

export function usePartyAnswerStats() {
  return useQuery({
    queryKey: ['party-answer-stats'],
    queryFn: async (): Promise<PartyAnswerStats[]> => {
      // Get total question count
      const { count: totalQuestions, error: questionsError } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true });

      if (questionsError) throw questionsError;

      // Get answer counts per party
      const { data: answerCounts, error: answersError } = await supabase
        .from('party_answers')
        .select('party_id');

      if (answersError) throw answersError;

      // Count answers per party
      const countByParty: Record<string, number> = {};
      answerCounts?.forEach(answer => {
        countByParty[answer.party_id] = (countByParty[answer.party_id] || 0) + 1;
      });

      // Build stats for each party
      return PARTIES.map(party => ({
        partyId: party.id,
        partyName: party.name,
        answerCount: countByParty[party.id] || 0,
        totalQuestions: totalQuestions || 0,
        percentage: totalQuestions 
          ? Math.round((countByParty[party.id] || 0) / totalQuestions * 100) 
          : 0,
      }));
    },
    staleTime: 30000, // Cache for 30 seconds
  });
}
