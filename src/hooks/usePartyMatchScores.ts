import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { calculateWeightedPartyScore, calculateEntityScore, TopicWeight } from '@/lib/scoring';

interface PartyScores {
  democrat: number | null;
  republican: number | null;
  green: number | null;
  libertarian: number | null;
}

/**
 * Fetch party match scores with user's topic weighting applied.
 * 
 * This hook:
 * 1. Fetches user's answered questions and their topic weights
 * 2. Fetches party answers only for questions the user answered
 * 3. Calculates weighted scores using user's topic priorities
 * 
 * This ensures party scores are comparable to user scores (both use same weighting).
 */
export function usePartyMatchScores() {
  const { user } = useAuth();

  return useQuery<PartyScores>({
    queryKey: ['party-scores-user-weighted', user?.id],
    queryFn: async () => {
      // Fetch user's answered questions with their topics
      const { data: userAnswers, error: userError } = await supabase
        .from('quiz_answers')
        .select(`
          question_id,
          questions!inner(topic_id)
        `);

      if (userError) throw userError;
      
      const userQuestionIds = new Set(userAnswers?.map(a => a.question_id) || []);
      
      // If user hasn't answered any questions, return nulls
      if (userQuestionIds.size === 0) {
        return { democrat: null, republican: null, green: null, libertarian: null };
      }

      // Build question -> topic map
      const questionTopicMap = new Map<string, string>();
      userAnswers?.forEach(a => {
        const topicId = (a.questions as unknown as { topic_id: string })?.topic_id;
        if (topicId) {
          questionTopicMap.set(a.question_id, topicId);
        }
      });

      // Fetch user's topic weights
      const { data: userTopics, error: topicsError } = await supabase
        .from('user_topics')
        .select('topic_id, weight')
        .order('weight', { ascending: false });

      if (topicsError) throw topicsError;

      // Convert to TopicWeight format
      const topicWeights: TopicWeight[] = (userTopics || []).map(ut => ({
        id: ut.topic_id,
        weight: ut.weight || 1,
      }));

      // Fetch all party answers
      const { data: partyAnswers, error: partyError } = await supabase
        .from('party_answers')
        .select('party_id, question_id, answer_value');

      if (partyError) throw partyError;

      // Group party answers by party_id, filtered to user's questions
      const partyAnswersMap = new Map<string, Array<{ question_id: string; answer_value: number }>>();
      partyAnswers?.forEach(answer => {
        if (userQuestionIds.has(answer.question_id)) {
          const existing = partyAnswersMap.get(answer.party_id) || [];
          existing.push({ question_id: answer.question_id, answer_value: answer.answer_value });
          partyAnswersMap.set(answer.party_id, existing);
        }
      });

      // Calculate weighted scores for each party using user's topic weights
      const calculateScore = (partyId: string): number | null => {
        const answers = partyAnswersMap.get(partyId) || [];
        if (answers.length === 0) return null;

        // If user has topic weights, use weighted calculation
        if (topicWeights.length > 0) {
          return calculateWeightedPartyScore(answers, topicWeights, questionTopicMap);
        }

        // Fallback to simple average if no topic weights
        return calculateEntityScore(answers.map(a => ({ 
          question_id: a.question_id, 
          answer_value: a.answer_value 
        })));
      };

      return {
        democrat: calculateScore('democrat'),
        republican: calculateScore('republican'),
        green: calculateScore('green'),
        libertarian: calculateScore('libertarian'),
      };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}
