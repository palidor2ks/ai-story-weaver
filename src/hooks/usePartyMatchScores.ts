import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PartyScores {
  democrat: number | null;
  republican: number | null;
  green: number | null;
  libertarian: number | null;
}

/**
 * Calculate average political score for a party's answers.
 * Returns the average answer_value on the -10 to +10 scale.
 */
function calculatePartyScore(partyAnswers: { answer_value: number }[]): number | null {
  if (partyAnswers.length === 0) return null;
  const sum = partyAnswers.reduce((acc, a) => acc + a.answer_value, 0);
  return sum / partyAnswers.length;
}

export function usePartyMatchScores() {
  return useQuery<PartyScores>({
    queryKey: ['party-scores-user-filtered'],
    queryFn: async () => {
      // Fetch user's answered question IDs
      const { data: userAnswers, error: userError } = await supabase
        .from('quiz_answers')
        .select('question_id');

      if (userError) throw userError;
      
      const userQuestionIds = new Set(userAnswers?.map(a => a.question_id) || []);
      
      // If user hasn't answered any questions, return nulls
      if (userQuestionIds.size === 0) {
        return { democrat: null, republican: null, green: null, libertarian: null };
      }

      // Fetch all party answers
      const { data: partyAnswers, error: partyError } = await supabase
        .from('party_answers')
        .select('party_id, question_id, answer_value');

      if (partyError) throw partyError;

      // Group party answers by party_id, but ONLY for questions user answered
      const partyAnswersMap = new Map<string, { answer_value: number }[]>();
      partyAnswers?.forEach(answer => {
        if (userQuestionIds.has(answer.question_id)) {
          const existing = partyAnswersMap.get(answer.party_id) || [];
          existing.push({ answer_value: answer.answer_value });
          partyAnswersMap.set(answer.party_id, existing);
        }
      });

      // Calculate average score for each party (filtered to user's questions)
      return {
        democrat: calculatePartyScore(partyAnswersMap.get('democrat') || []),
        republican: calculatePartyScore(partyAnswersMap.get('republican') || []),
        green: calculatePartyScore(partyAnswersMap.get('green') || []),
        libertarian: calculatePartyScore(partyAnswersMap.get('libertarian') || []),
      };
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes (depends on user's answers)
  });
}
