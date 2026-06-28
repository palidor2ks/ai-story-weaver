import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// The current user's answered question IDs. Shared by the Quiz and Quiz Library
// screens, which historically used different query keys (['quiz_answers', uid] and
// ['answered_questions', uid]) — both are invalidated together in useProfile, so
// the two hooks below keep their distinct keys while sharing this fetch.
async function fetchAnsweredQuestionIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('quiz_answers')
    .select('question_id')
    .eq('user_id', userId);
  if (error) throw error;
  return data.map((a) => a.question_id);
}

// Quiz Library — query key ['answered_questions', userId].
export function useAnsweredQuestions(userId: string | undefined) {
  return useQuery({
    queryKey: ['answered_questions', userId],
    enabled: !!userId,
    queryFn: () => fetchAnsweredQuestionIds(userId!),
  });
}

// Quiz — query key ['quiz_answers', userId].
export function useQuizAnswers(userId: string | undefined) {
  return useQuery({
    queryKey: ['quiz_answers', userId],
    enabled: !!userId,
    queryFn: () => fetchAnsweredQuestionIds(userId!),
  });
}

// Feed — most recent answered question IDs across users (deduped), no user filter.
export function useRecentAnsweredQuestionIds() {
  return useQuery({
    queryKey: ['feed-user-question-ids'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quiz_answers')
        .select('question_id')
        .order('created_at', { ascending: false })
        .limit(150);

      if (error) throw error;
      return Array.from(new Set((data ?? []).map((row) => row.question_id).filter(Boolean)));
    },
    staleTime: 5 * 60 * 1000,
  });
}
