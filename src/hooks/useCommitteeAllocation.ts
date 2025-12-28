import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface UnallocatedCommittee {
  id: string; // Primary key for reliable updates
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
  active: boolean;
}

export interface CommitteeDiagnostics {
  linkedJUBDCommittees: number;
  unallocatedContributions: number;
  totalContributions: number;
}

/**
 * Fetch J/U/B/D committees that have unallocated contributions (candidate_id = null)
 */
export function useUnallocatedCommittees(cycle: string = '2024') {
  return useQuery({
    queryKey: ['unallocated-committees', cycle],
    queryFn: async (): Promise<UnallocatedCommittee[]> => {
      // Fetch ALL committees that are either:
      // 1. J/U/B/D designations (joint fundraising, leadership PACs, etc.)
      // 2. OR have NULL candidate_id (orphan committees - externally imported)
      const { data: committees, error: committeeError } = await supabase
        .from('candidate_committees')
        .select('id, fec_committee_id, name, designation, designation_full, source_fec_candidate_id, candidate_id, active')
        .or('designation.in.(J,U,B,D),candidate_id.is.null')
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

      // Get donor count for these committees (all donors, not just unallocated)
      const { data: donorStats, error: donorError } = await supabase
        .from('donors')
        .select('recipient_committee_id')
        .in('recipient_committee_id', committeeIds)
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

      // Map to response - show ALL J/U/B/D committees, not just those with unallocated
      return committees.map(c => {
        const stats = contribByCommittee.get(c.fec_committee_id) || { total: 0, count: 0 };
        const donorCount = donorCountByCommittee.get(c.fec_committee_id) || 0;
        
        return {
          id: c.id, // Include primary key for reliable updates
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
          active: c.active ?? true,
        };
      });
    },
  });
}

/**
 * Fetch diagnostics for committee allocation
 */
export function useCommitteeDiagnostics(cycle: string = '2024') {
  return useQuery({
    queryKey: ['committee-diagnostics', cycle],
    queryFn: async (): Promise<CommitteeDiagnostics> => {
      // Count linked J/U/B/D committees
      const { count: linkedCount, error: linkedError } = await supabase
        .from('candidate_committees')
        .select('*', { count: 'exact', head: true })
        .in('designation', ['J', 'U', 'B', 'D'])
        .not('candidate_id', 'is', null);

      if (linkedError) throw linkedError;

      // Get all J/U/B/D committee IDs
      const { data: committees } = await supabase
        .from('candidate_committees')
        .select('fec_committee_id')
        .in('designation', ['J', 'U', 'B', 'D']);

      const committeeIds = committees?.map(c => c.fec_committee_id) || [];

      let unallocatedCount = 0;
      let totalCount = 0;

      if (committeeIds.length > 0) {
        // Count unallocated contributions
        const { count: unallocated } = await supabase
          .from('contributions')
          .select('*', { count: 'exact', head: true })
          .in('recipient_committee_id', committeeIds)
          .is('candidate_id', null)
          .eq('cycle', cycle);

        unallocatedCount = unallocated || 0;

        // Count total contributions for these committees
        const { count: total } = await supabase
          .from('contributions')
          .select('*', { count: 'exact', head: true })
          .in('recipient_committee_id', committeeIds)
          .eq('cycle', cycle);

        totalCount = total || 0;
      }

      return {
        linkedJUBDCommittees: linkedCount || 0,
        unallocatedContributions: unallocatedCount,
        totalContributions: totalCount,
      };
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
    mutationFn: async ({ committeeId, candidateId, cycle, force }: { 
      committeeId: string; 
      candidateId: string | null; 
      cycle?: string;
      force?: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke('allocate-committee', {
        body: { committeeId, candidateId, cycle: cycle || '2024', force: force || false }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['unallocated-committees'] });
      queryClient.invalidateQueries({ queryKey: ['committee-diagnostics'] });
      queryClient.invalidateQueries({ queryKey: ['donors'] });
      toast.success(data.message || 'Committee allocated successfully');
    },
    onError: (error: Error) => {
      console.error('Error allocating committee:', error);
      toast.error(`Failed to allocate committee: ${error.message}`);
    },
  });
}

export interface BatchAllocateResult {
  committeesFound: number;
  committeesChanged: number;
  committeesProcessed: number; // backwards compat
  totalContributionsUpdated: number;
  totalDonorsUpdated: number;
  totalTransfersDeleted: number;
  message: string;
}

/**
 * Batch allocate all J/U/B/D committees based on their candidate_committees links
 */
export function useBatchAllocateCommittees() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ cycle, force }: { cycle?: string; force?: boolean }): Promise<BatchAllocateResult> => {
      const { data, error } = await supabase.functions.invoke('allocate-committee', {
        body: { batch: true, cycle: cycle || '2024', force: force || false }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['unallocated-committees'] });
      queryClient.invalidateQueries({ queryKey: ['committee-diagnostics'] });
      queryClient.invalidateQueries({ queryKey: ['donors'] });
      toast.success(data.message || 'Batch allocation completed');
    },
    onError: (error: Error) => {
      console.error('Error in batch allocation:', error);
      toast.error(`Batch allocation failed: ${error.message}`);
    },
  });
}

/**
 * Toggle committee active status
 */
export function useToggleCommitteeActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      // Use primary key 'id' for reliable update (avoids issues with duplicate fec_committee_id)
      const { data, error } = await supabase
        .from('candidate_committees')
        .update({ active, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['unallocated-committees'] });
      queryClient.invalidateQueries({ queryKey: ['committee-diagnostics'] });
      toast.success(`Committee ${data.active ? 'activated' : 'deactivated'}`);
    },
    onError: (error: Error) => {
      console.error('Error toggling committee status:', error);
      toast.error(`Failed to update committee: ${error.message}`);
    },
  });
}
