import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

export interface QuestionUpdateNotification {
  id: string;
  question_id: string;
  entity_type: 'user' | 'candidate' | 'party';
  entity_id: string;
  old_question_text: string;
  new_question_text: string;
  created_at: string;
  dismissed_at: string | null;
  updated_answer_at: string | null;
  is_read: boolean;
}

export function useQuestionUpdateNotifications() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['question-update-notifications', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('question_update_notifications')
        .select('*')
        .eq('entity_type', 'user')
        .eq('entity_id', user.id)
        .is('dismissed_at', null)
        .is('updated_answer_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as QuestionUpdateNotification[];
    },
    enabled: !!user?.id,
  });
}

export function useCandidateQuestionNotifications(candidateId: string | undefined) {
  return useQuery({
    queryKey: ['candidate-question-notifications', candidateId],
    queryFn: async () => {
      if (!candidateId) return [];

      const { data, error } = await supabase
        .from('question_update_notifications')
        .select('*')
        .eq('entity_type', 'candidate')
        .eq('entity_id', candidateId)
        .is('dismissed_at', null)
        .is('updated_answer_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as QuestionUpdateNotification[];
    },
    enabled: !!candidateId,
  });
}

export function useDismissNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('question_update_notifications')
        .update({ dismissed_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['question-update-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-question-notifications'] });
    },
  });
}

export function useMarkAnswerUpdated() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ notificationId, questionId }: { notificationId?: string; questionId?: string }) => {
      if (notificationId) {
        const { error } = await supabase
          .from('question_update_notifications')
          .update({ updated_answer_at: new Date().toISOString() })
          .eq('id', notificationId);

        if (error) throw error;
      } else if (questionId) {
        // Mark all notifications for this question as updated
        const { error } = await supabase
          .from('question_update_notifications')
          .update({ updated_answer_at: new Date().toISOString() })
          .eq('question_id', questionId);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['question-update-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-question-notifications'] });
    },
  });
}

// Hook to get answer counts for a question (for admin warning)
export function useQuestionAnswerCounts(questionId: string | undefined) {
  return useQuery({
    queryKey: ['question-answer-counts', questionId],
    queryFn: async () => {
      if (!questionId) return { users: 0, candidates: 0, parties: 0, total: 0 };

      const [usersResult, candidatesResult, partiesResult] = await Promise.all([
        supabase
          .from('quiz_answers')
          .select('user_id', { count: 'exact', head: true })
          .eq('question_id', questionId),
        supabase
          .from('candidate_answers')
          .select('candidate_id', { count: 'exact', head: true })
          .eq('question_id', questionId),
        supabase
          .from('party_answers')
          .select('party_id', { count: 'exact', head: true })
          .eq('question_id', questionId),
      ]);

      const users = usersResult.count || 0;
      const candidates = candidatesResult.count || 0;
      const parties = partiesResult.count || 0;

      return {
        users,
        candidates,
        parties,
        total: users + candidates + parties,
      };
    },
    enabled: !!questionId,
  });
}
