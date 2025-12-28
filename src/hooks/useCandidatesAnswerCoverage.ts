import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CoverageTier, ConfidenceLevel } from '@/lib/scoreFormat';

export interface CandidateAnswerCoverage {
  id: string;
  name: string;
  party: string;
  office: string;
  state: string;
  answerCount: number;
  totalQuestions: number;
  percentage: number;
  coverageTier: CoverageTier;
  confidence: ConfidenceLevel;
  voteCount: number;
  donorCount: number;
  fecCandidateId: string | null;
  fecCommitteeId: string | null;
  committeeCount: number;         // Number of linked committees
  // Finance breakdown - from finance_reconciliation (single source of truth)
  localItemized: number;         // Local itemized contributions (gross)
  localItemizedNet: number;      // Local itemized NET (excluding earmark pass-throughs) - comparable to FEC
  localTransfers: number;        // Committee transfers
  localEarmarked: number;        // Earmarked contributions
  fecItemized: number | null;    // FEC itemized contributions
  fecUnitemized: number | null;  // FEC unitemized contributions
  fecTotalReceipts: number | null; // FEC total receipts
  deltaAmount: number | null;    // Difference between local NET and FEC
  deltaPct: number | null;       // Percentage difference
  reconciliationStatus: string | null; // ok, warning, error
  // Sync status
  hasPartialSync: boolean;       // True if any committee has has_more = true (incomplete sync)
  lastDonorSync: string | null;  // Last donor sync date from candidates table
  lastSyncDate: string | null;   // Last sync date from committees
  reconciliationCheckedAt: string | null; // When reconciliation was last checked
  syncStatus: 'never' | 'partial' | 'complete'; // Aggregated sync status
}

interface Filters {
  party?: string;
  state?: string;
  coverageFilter?: 'all' | 'none' | 'low' | 'full';
}

export function useCandidatesAnswerCoverage(filters: Filters = {}) {
  return useQuery({
    queryKey: ['candidates-answer-coverage', filters],
    queryFn: async (): Promise<CandidateAnswerCoverage[]> => {
      // Get total questions count
      const { count: totalQuestions, error: questionsError } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true });

      if (questionsError) throw questionsError;

      // Get all candidates with coverage tier and confidence
      let candidatesQuery = supabase
        .from('candidates')
        .select('id, name, party, office, state, coverage_tier, confidence, fec_candidate_id, fec_committee_id, last_donor_sync')
        .order('name', { ascending: true });

      if (filters.party && filters.party !== 'all') {
        candidatesQuery = candidatesQuery.eq('party', filters.party as 'Democrat' | 'Republican' | 'Independent' | 'Other');
      }

      if (filters.state && filters.state !== 'all') {
        candidatesQuery = candidatesQuery.eq('state', filters.state);
      }

      const { data: candidates, error: candidatesError } = await candidatesQuery;

      if (candidatesError) throw candidatesError;

      // Get answer counts per candidate (paginated to handle >1000 rows)
      const PAGE_SIZE = 1000;
      let from = 0;
      const allAnswers: Array<{ candidate_id: string }> = [];

      while (true) {
        const { data, error } = await supabase
          .from('candidate_answers')
          .select('id, candidate_id')
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;

        (data || []).forEach(row => allAnswers.push({ candidate_id: row.candidate_id }));

        if (!data || data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
        if (from > 500000) break;
      }

      // Get vote counts per candidate
      const { data: votesData } = await supabase
        .from('votes')
        .select('candidate_id');
      
      const voteCountMap: Record<string, number> = {};
      (votesData || []).forEach(row => {
        voteCountMap[row.candidate_id] = (voteCountMap[row.candidate_id] || 0) + 1;
      });

      // Get donor counts per candidate
      const { data: donorsData } = await supabase
        .from('donors')
        .select('candidate_id');
      
      const donorCountMap: Record<string, number> = {};
      (donorsData || []).forEach(row => {
        donorCountMap[row.candidate_id] = (donorCountMap[row.candidate_id] || 0) + 1;
      });

      // Get finance data from finance_reconciliation (single source of truth)
      const FINANCE_CYCLE = '2024';
      
      const { data: reconciliationData } = await supabase
        .from('finance_reconciliation')
        .select('*')
        .eq('cycle', FINANCE_CYCLE);

      interface ReconciliationRecord {
        candidate_id: string;
        local_itemized: number | null;
        local_itemized_net: number | null;
        local_transfers: number | null;
        local_earmarked: number | null;
        fec_itemized: number | null;
        fec_unitemized: number | null;
        fec_total_receipts: number | null;
        delta_amount: number | null;
        delta_pct: number | null;
        status: string | null;
        checked_at: string | null;
      }

      const reconciliationMap: Record<string, ReconciliationRecord> = {};
      (reconciliationData || []).forEach(row => {
        reconciliationMap[row.candidate_id] = row;
      });

      // Get partial sync status from candidate_committees (has_more = true means incomplete sync)
      const { data: partialSyncData } = await supabase
        .from('candidate_committees')
        .select('candidate_id, has_more, last_sync_date, last_sync_completed_at');

      const partialSyncMap: Record<string, boolean> = {};
      const lastSyncMap: Record<string, string | null> = {};
      const completeSyncMap: Record<string, boolean> = {};
      const committeeCountMap: Record<string, number> = {};
      
      (partialSyncData || []).forEach(row => {
        // Count committees per candidate
        committeeCountMap[row.candidate_id] = (committeeCountMap[row.candidate_id] || 0) + 1;
        // has_more = true means incomplete sync
        if (row.has_more === true) {
          partialSyncMap[row.candidate_id] = true;
        }
        if (row.last_sync_date) {
          lastSyncMap[row.candidate_id] = row.last_sync_date;
        }
        // If any committee has completed sync, mark it
        if (row.last_sync_completed_at) {
          completeSyncMap[row.candidate_id] = true;
        }
      });

      // Count answers per candidate
      const answerCountMap: Record<string, number> = {};
      allAnswers.forEach(row => {
        answerCountMap[row.candidate_id] = (answerCountMap[row.candidate_id] || 0) + 1;
      });

      // Build result with coverage info
      const results: CandidateAnswerCoverage[] = (candidates || []).map(c => {
        const answerCount = answerCountMap[c.id] || 0;
        const percentage = totalQuestions ? Math.round((answerCount / totalQuestions) * 100) : 0;
        const rec = reconciliationMap[c.id];
        
        // Determine sync status
        const hasPartialSync = partialSyncMap[c.id] || false;
        const hasCompletedAnySync = completeSyncMap[c.id] || false;
        const hasLastDonorSync = !!c.last_donor_sync;
        
        let syncStatus: 'never' | 'partial' | 'complete' = 'never';
        if (hasPartialSync) {
          syncStatus = 'partial';
        } else if (hasLastDonorSync || hasCompletedAnySync) {
          syncStatus = 'complete';
        }
        
        return {
          id: c.id,
          name: c.name,
          party: c.party,
          office: c.office,
          state: c.state,
          answerCount,
          totalQuestions: totalQuestions || 0,
          percentage,
          coverageTier: (c.coverage_tier as CoverageTier) || 'tier_3',
          confidence: (c.confidence as ConfidenceLevel) || 'low',
          voteCount: voteCountMap[c.id] || 0,
          donorCount: donorCountMap[c.id] || 0,
          fecCandidateId: c.fec_candidate_id || null,
          fecCommitteeId: c.fec_committee_id || null,
          committeeCount: committeeCountMap[c.id] || 0,
          // Finance data from reconciliation table (single source of truth)
          localItemized: rec?.local_itemized || 0,
          localItemizedNet: rec?.local_itemized_net || 0, // NET for proper comparison
          localTransfers: rec?.local_transfers || 0,
          localEarmarked: rec?.local_earmarked || 0,
          fecItemized: rec?.fec_itemized ?? null,
          fecUnitemized: rec?.fec_unitemized ?? null,
          fecTotalReceipts: rec?.fec_total_receipts ?? null,
          deltaAmount: rec?.delta_amount ?? null,
          deltaPct: rec?.delta_pct ?? null,
          reconciliationStatus: rec?.status || null,
          hasPartialSync,
          lastDonorSync: c.last_donor_sync || null,
          lastSyncDate: lastSyncMap[c.id] || null,
          reconciliationCheckedAt: rec?.checked_at || null,
          syncStatus,
        };
      });

      // Apply coverage filter
      let filtered = results;
      if (filters.coverageFilter === 'none') {
        filtered = results.filter(c => c.answerCount === 0);
      } else if (filters.coverageFilter === 'low') {
        filtered = results.filter(c => c.answerCount > 0 && c.percentage < 50);
      } else if (filters.coverageFilter === 'full') {
        filtered = results.filter(c => c.percentage >= 100);
      }

      // Sort by answer count ascending (least coverage first)
      return filtered.sort((a, b) => a.answerCount - b.answerCount);
    },
    staleTime: 30000,
  });
}

export function useCandidateAnswerStats() {
  return useQuery({
    queryKey: ['candidate-answer-stats'],
    queryFn: async () => {
      // Get total questions count
      const { count: totalQuestions, error: questionsError } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true });

      if (questionsError) throw questionsError;

      // Get all candidates count
      const { count: totalCandidates, error: candidatesError } = await supabase
        .from('candidates')
        .select('*', { count: 'exact', head: true });

      if (candidatesError) throw candidatesError;

      // Get all answers (paginated)
      const PAGE_SIZE = 1000;
      let from = 0;
      const allAnswers: Array<{ candidate_id: string }> = [];

      while (true) {
        const { data, error } = await supabase
          .from('candidate_answers')
          .select('id, candidate_id')
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;

        (data || []).forEach(row => allAnswers.push({ candidate_id: row.candidate_id }));

        if (!data || data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
        if (from > 500000) break;
      }

      // Count per candidate
      const answerCountMap: Record<string, number> = {};
      allAnswers.forEach(row => {
        answerCountMap[row.candidate_id] = (answerCountMap[row.candidate_id] || 0) + 1;
      });

      const candidatesWithAnswers = Object.keys(answerCountMap);
      const noAnswers = (totalCandidates || 0) - candidatesWithAnswers.length;
      const lowCoverage = candidatesWithAnswers.filter(id => {
        const count = answerCountMap[id];
        const pct = totalQuestions ? (count / totalQuestions) * 100 : 0;
        return pct > 0 && pct < 50;
      }).length;
      const fullCoverage = candidatesWithAnswers.filter(id => {
        const count = answerCountMap[id];
        return totalQuestions && count >= totalQuestions;
      }).length;

      return {
        totalCandidates: totalCandidates || 0,
        noAnswers,
        lowCoverage,
        fullCoverage,
        totalQuestions: totalQuestions || 0,
      };
    },
    staleTime: 30000,
  });
}

export function useUniqueStates() {
  return useQuery({
    queryKey: ['unique-states'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidates')
        .select('state')
        .order('state', { ascending: true });

      if (error) throw error;

      const states = [...new Set((data || []).map(c => c.state))].filter(Boolean);
      return states;
    },
    staleTime: 60000,
  });
}

// Hook for recalculating coverage tiers
export function useRecalculateCoverageTiers() {
  const queryClient = useQueryClient();

  const recalculateAll = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('recalculate_all_coverage_tiers');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates-answer-coverage'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-answer-stats'] });
    },
  });

  const recalculateSingle = useMutation({
    mutationFn: async (candidateId: string) => {
      const { data, error } = await supabase.rpc('recalculate_candidate_coverage', {
        p_candidate_id: candidateId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates-answer-coverage'] });
    },
  });

  return {
    recalculateAll: recalculateAll.mutateAsync,
    recalculateSingle: recalculateSingle.mutateAsync,
    isRecalculatingAll: recalculateAll.isPending,
    isRecalculatingSingle: recalculateSingle.isPending,
  };
}
