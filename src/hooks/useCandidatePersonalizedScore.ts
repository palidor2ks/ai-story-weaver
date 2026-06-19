import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { calculateEntityScore } from '@/lib/scoring';

/**
 * Personalized rep score: averages the candidate's stored answers,
 * restricted to the question set the current user has answered.
 * Mirrors party-alignment behavior so it's directly comparable to the user.
 */
export const useCandidatePersonalizedScore = (candidateId?: string) => {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['candidate-personalized-score', candidateId, userId],
    enabled: !!candidateId && !!userId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      if (!candidateId || !userId) return null;

      const { data: userAnswers, error: uaErr } = await supabase
        .from('quiz_answers')
        .select('question_id')
        .eq('user_id', userId);
      if (uaErr) throw uaErr;

      const questionIds = (userAnswers || []).map((a) => a.question_id).filter(Boolean);
      if (questionIds.length === 0) {
        return { score: null as number | null, answeredCount: 0, matchedCount: 0 };
      }

      const { data: candAnswers, error: caErr } = await supabase
        .from('candidate_answers')
        .select('question_id, answer_value')
        .eq('candidate_id', candidateId)
        .in('question_id', questionIds);
      if (caErr) throw caErr;

      const matched = (candAnswers || []).filter(
        (a) => a.answer_value !== null && a.answer_value !== undefined
      );
      if (matched.length === 0) {
        return { score: null as number | null, answeredCount: questionIds.length, matchedCount: 0 };
      }

      const score = calculateEntityScore(
        matched.map((a) => ({ question_id: a.question_id, answer_value: a.answer_value }))
      );

      return {
        score,
        answeredCount: questionIds.length,
        matchedCount: matched.length,
      };
    },
  });
};
