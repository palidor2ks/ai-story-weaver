import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

export interface ClaimedCandidate {
  id: string;
  name: string;
  party: string;
  office: string;
  state: string;
  district: string | null;
  image_url: string | null;
  overall_score: number | null;
  claimed_at: string | null;
}

// Get the candidate profile claimed by the current user
export function useClaimedProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['claimed-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('candidates')
        .select('id, name, party, office, state, district, image_url, overall_score, claimed_at')
        .eq('claimed_by_user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data as ClaimedCandidate | null;
    },
    enabled: !!user?.id,
  });
}

// Check if user has politician role
export function usePoliticianRole() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['politician-role', user?.id],
    queryFn: async () => {
      if (!user?.id) return { isPolitician: false };

      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'politician')
        .maybeSingle();

      if (error) {
        console.error('Error checking politician role:', error);
        return { isPolitician: false };
      }

      return { isPolitician: !!data };
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
  });
}

export interface CandidateAnswerInput {
  question_id: string;
  answer_value: number;
  source_url?: string;
  source_description?: string;
  source_type?: string;
  confidence?: string;
}

// Upsert a candidate answer (for politicians editing their own answers)
export function useUpsertCandidateAnswer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      candidateId,
      answer,
    }: {
      candidateId: string;
      answer: CandidateAnswerInput;
    }) => {
      // Check if answer exists
      const { data: existing } = await supabase
        .from('candidate_answers')
        .select('id')
        .eq('candidate_id', candidateId)
        .eq('question_id', answer.question_id)
        .maybeSingle();

      if (existing) {
        // Update existing answer
        const { data, error } = await supabase
          .from('candidate_answers')
          .update({
            answer_value: answer.answer_value,
            source_url: answer.source_url || null,
            source_description: answer.source_description || null,
            source_type: answer.source_type || 'other',
            confidence: answer.confidence || 'high',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Insert new answer
        const { data, error } = await supabase
          .from('candidate_answers')
          .insert({
            candidate_id: candidateId,
            question_id: answer.question_id,
            answer_value: answer.answer_value,
            source_url: answer.source_url || null,
            source_description: answer.source_description || null,
            source_type: answer.source_type || 'other',
            confidence: answer.confidence || 'high',
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['candidate-answers', variables.candidateId] });
      queryClient.invalidateQueries({ queryKey: ['smart-candidate-answers'] });
      toast.success('Answer saved successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to save answer: ${error.message}`);
    },
  });
}

// Delete a candidate answer
export function useDeleteCandidateAnswer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      candidateId,
      questionId,
    }: {
      candidateId: string;
      questionId: string;
    }) => {
      const { error } = await supabase
        .from('candidate_answers')
        .delete()
        .eq('candidate_id', candidateId)
        .eq('question_id', questionId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['candidate-answers', variables.candidateId] });
      queryClient.invalidateQueries({ queryKey: ['smart-candidate-answers'] });
      toast.success('Answer removed');
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove answer: ${error.message}`);
    },
  });
}
