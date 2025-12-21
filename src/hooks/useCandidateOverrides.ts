import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

export interface CandidateOverride {
  id: string;
  candidate_id: string;
  name: string | null;
  party: string | null;
  office: string | null;
  state: string | null;
  district: string | null;
  image_url: string | null;
  overall_score: number | null;
  coverage_tier: string | null;
  confidence: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface CandidateOverrideInput {
  candidate_id: string;
  name?: string | null;
  party?: string | null;
  office?: string | null;
  state?: string | null;
  district?: string | null;
  image_url?: string | null;
  overall_score?: number | null;
  coverage_tier?: string | null;
  confidence?: string | null;
  notes?: string | null;
}

// Fetch single override for a candidate
export const useCandidateOverride = (candidateId: string | undefined) => {
  return useQuery({
    queryKey: ['candidate_override', candidateId],
    queryFn: async () => {
      if (!candidateId) return null;
      
      const { data, error } = await supabase
        .from('candidate_overrides')
        .select('*')
        .eq('candidate_id', candidateId)
        .maybeSingle();
      
      if (error) throw error;
      return data as CandidateOverride | null;
    },
    enabled: !!candidateId,
  });
};

// Fetch all overrides (for Admin page)
export const useCandidateOverrides = () => {
  return useQuery({
    queryKey: ['candidate_overrides'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidate_overrides')
        .select('*')
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      return data as CandidateOverride[];
    },
  });
};

// Upsert (create or update) an override
export const useUpsertCandidateOverride = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: CandidateOverrideInput) => {
      // Check if override exists
      const { data: existing } = await supabase
        .from('candidate_overrides')
        .select('id')
        .eq('candidate_id', input.candidate_id)
        .maybeSingle();

      if (existing) {
        // Update
        const { data, error } = await supabase
          .from('candidate_overrides')
          .update({
            ...input,
            updated_by: user?.id,
          })
          .eq('candidate_id', input.candidate_id)
          .select()
          .single();
        
        if (error) throw error;
        return data;
      } else {
        // Insert
        const { data, error } = await supabase
          .from('candidate_overrides')
          .insert({
            ...input,
            created_by: user?.id,
            updated_by: user?.id,
          })
          .select()
          .single();
        
        if (error) throw error;
        return data;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['candidate_override', variables.candidate_id] });
      queryClient.invalidateQueries({ queryKey: ['candidate_overrides'] });
      queryClient.invalidateQueries({ queryKey: ['candidate', variables.candidate_id] });
      toast.success('Override saved successfully');
    },
    onError: (error) => {
      console.error('Failed to save override:', error);
      toast.error('Failed to save override');
    },
  });
};

// Delete an override
export const useDeleteCandidateOverride = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (candidateId: string) => {
      const { error } = await supabase
        .from('candidate_overrides')
        .delete()
        .eq('candidate_id', candidateId);
      
      if (error) throw error;
    },
    onSuccess: (_, candidateId) => {
      queryClient.invalidateQueries({ queryKey: ['candidate_override', candidateId] });
      queryClient.invalidateQueries({ queryKey: ['candidate_overrides'] });
      queryClient.invalidateQueries({ queryKey: ['candidate', candidateId] });
      toast.success('Override removed - reverting to API data');
    },
    onError: (error) => {
      console.error('Failed to delete override:', error);
      toast.error('Failed to delete override');
    },
  });
};
