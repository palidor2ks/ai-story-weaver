import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

interface PartyMatchScores {
  democrat: number;
  republican: number;
  green: number;
  libertarian: number;
}

/**
 * Calculate match percentage between user answers and party answers.
 * Uses the same logic as candidate matching: smaller difference = higher match.
 */
function calculatePartyMatchScore(
  userAnswers: { question_id: string; value: number }[],
  partyAnswers: { question_id: string; answer_value: number }[]
): number {
  const partyQuestionMap = new Map(partyAnswers.map(a => [a.question_id, a.answer_value]));
  
  let matchSum = 0;
  let matchCount = 0;
  
  for (const userAnswer of userAnswers) {
    const partyValue = partyQuestionMap.get(userAnswer.question_id);
    if (partyValue !== undefined) {
      // Convert -10 to +10 difference into 0-100% match
      const diff = Math.abs(userAnswer.value - partyValue);
      const maxDiff = 20; // Range from -10 to +10
      const match = 100 - (diff / maxDiff) * 100;
      matchSum += match;
      matchCount++;
    }
  }
  
  return matchCount > 0 ? Math.round(matchSum / matchCount) : 0;
}

export function usePartyMatchScores() {
  const { user } = useAuth();

  return useQuery<PartyMatchScores>({
    queryKey: ['party-match-scores', user?.id],
    queryFn: async () => {
      if (!user?.id) {
        return { democrat: 0, republican: 0, green: 0, libertarian: 0 };
      }

      // Fetch user's quiz answers
      const { data: userAnswers, error: userError } = await supabase
        .from('quiz_answers')
        .select('question_id, value')
        .eq('user_id', user.id);

      if (userError) throw userError;
      if (!userAnswers || userAnswers.length === 0) {
        return { democrat: 0, republican: 0, green: 0, libertarian: 0 };
      }

      // Fetch all party answers
      const { data: partyAnswers, error: partyError } = await supabase
        .from('party_answers')
        .select('party_id, question_id, answer_value');

      if (partyError) throw partyError;

      // Group party answers by party_id
      const partyAnswersMap = new Map<string, { question_id: string; answer_value: number }[]>();
      partyAnswers?.forEach(answer => {
        const existing = partyAnswersMap.get(answer.party_id) || [];
        existing.push({ question_id: answer.question_id, answer_value: answer.answer_value });
        partyAnswersMap.set(answer.party_id, existing);
      });

      // Calculate match scores for each party
      return {
        democrat: calculatePartyMatchScore(userAnswers, partyAnswersMap.get('democrat') || []),
        republican: calculatePartyMatchScore(userAnswers, partyAnswersMap.get('republican') || []),
        green: calculatePartyMatchScore(userAnswers, partyAnswersMap.get('green') || []),
        libertarian: calculatePartyMatchScore(userAnswers, partyAnswersMap.get('libertarian') || []),
      };
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}
