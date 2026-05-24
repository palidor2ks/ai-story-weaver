import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { calculateEntityScore } from '@/lib/scoring';

/**
 * Personalized rep score map: averages each candidate's answer_value across
 * ONLY the questions the current user has answered. Apples-to-apples comparison.
 *
 * Returns Map<candidateId, score> where score is on the -10..+10 scale.
 * Candidates with zero overlapping answers are omitted from the map (caller
 * should treat as NA).
 */
export const usePersonalizedScoreMap = (candidateIds?: string[]) => {
  const { user } = useAuth();
  const ids = (candidateIds ?? []).filter(Boolean);
  const idsKey = [...ids].sort().join(',');

  return useQuery({
    queryKey: ['personalized-score-map', user?.id ?? 'anon', idsKey],
    queryFn: async () => {
      const map = new Map<string, number>();
      if (!user?.id || ids.length === 0) return map;

      // Fetch user's answered question IDs
      const { data: userAnswers, error: userErr } = await supabase
        .from('quiz_answers')
        .select('question_id')
        .eq('user_id', user.id);

      if (userErr) {
        console.error('Error fetching user quiz answers:', userErr);
        return map;
      }

      const questionIds = (userAnswers ?? [])
        .map((a) => a.question_id)
        .filter(Boolean);

      if (questionIds.length === 0) return map;

      // Fetch candidate answers restricted to those questions
      const { data: candidateAnswers, error: caErr } = await supabase
        .from('candidate_answers')
        .select('candidate_id, question_id, answer_value')
        .in('candidate_id', ids)
        .in('question_id', questionIds);

      if (caErr) {
        console.error('Error fetching candidate answers for personalized scores:', caErr);
        return map;
      }

      // Group by candidate and average
      const byCandidate = new Map<string, Array<{ question_id: string; answer_value: number }>>();
      (candidateAnswers ?? []).forEach((a) => {
        const arr = byCandidate.get(a.candidate_id) ?? [];
        arr.push({ question_id: a.question_id, answer_value: a.answer_value });
        byCandidate.set(a.candidate_id, arr);
      });

      byCandidate.forEach((answers, candidateId) => {
        const score = calculateEntityScore(answers);
        if (score !== null) map.set(candidateId, score);
      });

      return map;
    },
    enabled: !!user?.id && ids.length > 0,
    staleTime: 1000 * 60 * 2,
  });
};
