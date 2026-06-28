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

// Count of a user's quiz answers (admin user-profile view).
export function useUserAnswerCount(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'user-answer-count', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('quiz_answers')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

// A user's answers joined with question text + topic name (representative
// comparison card). Returns the raw joined rows.
export function useUserAnswersWithDetails(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-quiz-answers-with-details', userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('quiz_answers')
        .select(`
          question_id,
          value,
          questions:question_id (
            text,
            topics:topic_id (name)
          )
        `)
        .eq('user_id', userId);

      if (error) {
        console.error('Error fetching user answers:', error);
        return [];
      }

      return data || [];
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  });
}

export interface UserAnswerWithQuestion {
  question_id: string;
  value: number;
  question_text: string;
  topic_name: string;
  is_skipped: boolean;
}

// A user's answers flattened to { value, question_text, topic_name, is_skipped }
// (party comparison card).
export function useUserAnswersWithQuestions(userId: string | undefined) {
  return useQuery({
    queryKey: ['quiz-answers-with-questions', userId],
    queryFn: async (): Promise<UserAnswerWithQuestion[]> => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('quiz_answers')
        .select(`
          question_id,
          value,
          selected_option_id,
          questions!inner (
            text,
            topics!inner (name)
          ),
          question_options!quiz_answers_selected_option_id_fkey (
            is_skip_option
          )
        `)
        .eq('user_id', userId);

      if (error) {
        console.error('Error fetching user answers:', error);
        return [];
      }

      return (data as unknown as Array<{
        question_id: string;
        value: number;
        questions: { text: string; topics: { name: string } };
        question_options?: { is_skip_option?: boolean } | null;
      }>).map((a) => ({
        question_id: a.question_id,
        value: a.value,
        question_text: a.questions.text,
        topic_name: a.questions.topics.name,
        is_skipped: a.question_options?.is_skip_option ?? false,
      }));
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  });
}
