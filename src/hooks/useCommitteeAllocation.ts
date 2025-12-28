import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface UnallocatedCommittee {
  fec_committee_id: string;
  name: string | null;
  designation: string | null;
  designation_full: string | null;
  source_fec_candidate_id: string | null;
  total_contributions: number;
  contribution_count: number;
  donor_count: number;
  linked_candidate_id: string | null;
  linked_candidate_name: string | null;
}

/**
 * Fetch J/U/B/D committees that have unallocated contributions (candidate_id = null)
 */
export function useUnallocatedCommittees(cycle: string = '2024') {
  return useQuery({
    queryKey: ['unallocated-committees', cycle],
    queryFn: async (): Promise<UnallocatedCommittee[]> => {
      // First, get all committees with J/U/B/D designations
      const { data: committees, error: committeeError } = await supabase
        .from('candidate_committees')
        .select('fec_committee_id, name, designation, designation_full, source_fec_candidate_id, candidate_id')
        .in('designation', ['J', 'U', 'B', 'D'])
        .order('name');

      if (committeeError) throw committeeError;
      if (!committees || committees.length === 0) return [];

      // Get contribution stats for these committees with null candidate_id
      const committeeIds = committees.map(c => c.fec_committee_id);
      
      // Get contributions with null candidate_id for these committees
      const { data: contributionStats, error: contribError } = await supabase
        .from('contributions')
        .select('recipient_committee_id, amount')
        .in('recipient_committee_id', committeeIds)
        .is('candidate_id', null)
        .eq('cycle', cycle);

      if (contribError) throw contribError;

      // Get donor count for these committees with null candidate_id
      const { data: donorStats, error: donorError } = await supabase
        .from('donors')
        .select('recipient_committee_id')
        .in('recipient_committee_id', committeeIds)
        .is('candidate_id', null)
        .eq('cycle', cycle);

      if (donorError) throw donorError;

      // Aggregate stats by committee
      const contribByCommittee = new Map<string, { total: number; count: number }>();
      (contributionStats || []).forEach(c => {
        const existing = contribByCommittee.get(c.recipient_committee_id!) || { total: 0, count: 0 };
        existing.total += c.amount || 0;
        existing.count++;
        contribByCommittee.set(c.recipient_committee_id!, existing);
      });

      const donorCountByCommittee = new Map<string, number>();
      (donorStats || []).forEach(d => {
        const current = donorCountByCommittee.get(d.recipient_committee_id!) || 0;
        donorCountByCommittee.set(d.recipient_committee_id!, current + 1);
      });

      // Get candidate names for linked candidates
      const candidateIds = [...new Set(committees.filter(c => c.candidate_id).map(c => c.candidate_id!))];
      let candidateNames = new Map<string, string>();
      
      if (candidateIds.length > 0) {
        const { data: candidates } = await supabase
          .from('candidates')
          .select('id, name')
          .in('id', candidateIds);
        
        (candidates || []).forEach(c => {
          candidateNames.set(c.id, c.name);
        });
      }

      // Map to response
      return committees.map(c => {
        const stats = contribByCommittee.get(c.fec_committee_id) || { total: 0, count: 0 };
        const donorCount = donorCountByCommittee.get(c.fec_committee_id) || 0;
        
        return {
          fec_committee_id: c.fec_committee_id,
          name: c.name,
          designation: c.designation,
          designation_full: c.designation_full,
          source_fec_candidate_id: c.source_fec_candidate_id,
          total_contributions: stats.total,
          contribution_count: stats.count,
          donor_count: donorCount,
          linked_candidate_id: c.candidate_id,
          linked_candidate_name: c.candidate_id ? candidateNames.get(c.candidate_id) || null : null,
        };
      }).filter(c => c.contribution_count > 0 || c.donor_count > 0); // Only show committees with data
    },
  });
}

/**
 * Get all candidates for the allocation dropdown
 */
export function useCandidatesForAllocation() {
  return useQuery({
    queryKey: ['candidates-for-allocation'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidates')
        .select('id, name, party, state, office')
        .order('name');

      if (error) throw error;
      return data || [];
    },
  });
}

/**
 * Allocate a committee to a candidate
 */
export function useAllocateCommittee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ committeeId, candidateId, cycle }: { 
      committeeId: string; 
      candidateId: string | null; 
      cycle?: string 
    }) => {
      const { data, error } = await supabase.functions.invoke('allocate-committee', {
        body: { committeeId, candidateId, cycle: cycle || '2024' }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['unallocated-committees'] });
      queryClient.invalidateQueries({ queryKey: ['donors'] });
      toast.success(data.message || 'Committee allocated successfully');
    },
    onError: (error: Error) => {
      console.error('Error allocating committee:', error);
      toast.error(`Failed to allocate committee: ${error.message}`);
    },
  });
}
