import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CandidateFecId {
  id: string;
  candidate_id: string;
  fec_candidate_id: string;
  office: string;
  state: string | null;
  district: string | null;
  is_primary: boolean;
  cycle: string | null;
  match_method: string | null;
  match_score: number | null;
  created_at: string;
  updated_at: string;
}

export function useCandidateFecIds(candidateId: string | undefined) {
  return useQuery({
    queryKey: ['candidate-fec-ids', candidateId],
    queryFn: async () => {
      if (!candidateId) return [];
      
      const { data, error } = await supabase
        .from('candidate_fec_ids')
        .select('*')
        .eq('candidate_id', candidateId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as CandidateFecId[];
    },
    enabled: !!candidateId,
  });
}

export function useAddCandidateFecId() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      candidateId,
      fecCandidateId,
      office,
      state,
      district,
      isPrimary,
      cycle,
    }: {
      candidateId: string;
      fecCandidateId: string;
      office: string;
      state?: string;
      district?: string;
      isPrimary?: boolean;
      cycle?: string;
    }) => {
      // If setting as primary, first unset any existing primary
      if (isPrimary) {
        await supabase
          .from('candidate_fec_ids')
          .update({ is_primary: false })
          .eq('candidate_id', candidateId)
          .eq('is_primary', true);
      }
      
      const { data, error } = await supabase
        .from('candidate_fec_ids')
        .upsert({
          candidate_id: candidateId,
          fec_candidate_id: fecCandidateId,
          office,
          state: state || null,
          district: district || null,
          is_primary: isPrimary || false,
          cycle: cycle || null,
          match_method: 'manual',
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'candidate_id,fec_candidate_id'
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['candidate-fec-ids', variables.candidateId] });
      toast.success('FEC ID added successfully');
    },
    onError: (error) => {
      console.error('Error adding FEC ID:', error);
      toast.error('Failed to add FEC ID');
    },
  });
}

export function useDeleteCandidateFecId() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, candidateId }: { id: string; candidateId: string }) => {
      const { error } = await supabase
        .from('candidate_fec_ids')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return { id, candidateId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['candidate-fec-ids', result.candidateId] });
      toast.success('FEC ID removed');
    },
    onError: (error) => {
      console.error('Error deleting FEC ID:', error);
      toast.error('Failed to remove FEC ID');
    },
  });
}

export function useSetPrimaryFecId() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, candidateId }: { id: string; candidateId: string }) => {
      // Unset existing primary
      await supabase
        .from('candidate_fec_ids')
        .update({ is_primary: false })
        .eq('candidate_id', candidateId);
      
      // Set new primary
      const { error } = await supabase
        .from('candidate_fec_ids')
        .update({ is_primary: true, updated_at: new Date().toISOString() })
        .eq('id', id);
      
      if (error) throw error;
      return { id, candidateId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['candidate-fec-ids', result.candidateId] });
      toast.success('Primary FEC ID updated');
    },
    onError: (error) => {
      console.error('Error setting primary FEC ID:', error);
      toast.error('Failed to set primary FEC ID');
    },
  });
}
