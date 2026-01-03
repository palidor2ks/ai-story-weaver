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
  sourcedCount: number;           // Answers with valid (non-party-inferred) sources
  sourcePercentage: number;       // Percentage of answers with valid sources
  overallScore: number | null;    // Political score (-10 to +10)
  coverageTier: CoverageTier;
  confidence: ConfidenceLevel;
  voteCount: number;
  legislativeActionsCount: number;  // Sponsored/cosponsored bills
  floorVotesCount: number;          // Actual Yea/Nay roll-call votes
  expectedVoteCount: number | null;  // Expected from Congress.gov API
  expectedFloorVotes: number | null; // Expected floor votes
  voteSyncStatus: 'never' | 'partial' | 'complete' | 'error'; // Aggregated vote sync status
  floorVoteSyncStatus: 'never' | 'partial' | 'complete' | 'error'; // Floor vote sync status
  lastVoteSyncAt: string | null;  // When votes were last synced
  donorCount: number;
  fecCandidateId: string | null;
  fecCommitteeId: string | null;
  committeeCount: number;         // Number of linked committees
  // Finance breakdown - from finance_reconciliation (single source of truth)
  localItemized: number;         // Local itemized contributions (gross)
  localItemizedNet: number;      // Local itemized NET (excluding earmark pass-throughs) - comparable to FEC
  localTransfers: number;        // Committee transfers
  localEarmarked: number;        // Earmarked contributions
  localLoans: number;            // Candidate loans (Line 13A)
  fecItemized: number | null;    // FEC itemized contributions
  fecUnitemized: number | null;  // FEC unitemized contributions
  fecTotalReceipts: number | null; // FEC total receipts
  fecPacContributions: number;   // FEC PAC contributions (line 11C)
  fecPartyContributions: number; // FEC party contributions
  fecLoans: number;              // Candidate loans
  fecTransfers: number;          // Committee transfers (line 12)
  fecCandidateContribution: number; // Candidate self-contribution (non-loan)
  fecOtherReceipts: number;      // Other receipts
  deltaAmount: number | null;    // Difference between local NET and FEC
  deltaPct: number | null;       // Percentage difference
  reconciliationStatus: string | null; // ok, warning, error
  // Sync status
  hasPartialSync: boolean;       // True if any committee has has_more = true (incomplete sync)
  lastDonorSync: string | null;  // Last donor sync date from candidates table
  lastSyncDate: string | null;   // Last sync date from committees
  reconciliationCheckedAt: string | null; // When reconciliation was last checked
  syncStatus: 'never' | 'partial' | 'complete'; // Aggregated sync status
  // Validation flags
  fecIdMismatch: boolean;        // True if FEC ID prefix doesn't match office (H=House, S=Senate, P=President)
  fecIdMismatchReason: string | null; // Human-readable reason for the mismatch
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
        .select('id, name, party, office, state, overall_score, coverage_tier, confidence, fec_candidate_id, fec_committee_id, last_donor_sync')
        .order('name', { ascending: true });

      if (filters.party && filters.party !== 'all') {
        candidatesQuery = candidatesQuery.eq('party', filters.party as 'Democrat' | 'Republican' | 'Independent' | 'Other');
      }

      if (filters.state && filters.state !== 'all') {
        candidatesQuery = candidatesQuery.eq('state', filters.state);
      }

      const { data: candidates, error: candidatesError } = await candidatesQuery;

      if (candidatesError) throw candidatesError;

      // Get answer counts per candidate with source info (paginated to handle >1000 rows)
      const PAGE_SIZE = 1000;
      let from = 0;
      const allAnswers: Array<{ candidate_id: string; source_description: string | null }> = [];

      while (true) {
        const { data, error } = await supabase
          .from('candidate_answers')
          .select('id, candidate_id, source_description')
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;

        (data || []).forEach(row => allAnswers.push({ 
          candidate_id: row.candidate_id,
          source_description: row.source_description
        }));

        if (!data || data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
        if (from > 500000) break;
      }

      // Helper to check if answer has a valid (non-party-inferred) source
      const hasValidSource = (desc: string | null) => {
        if (!desc) return false;
        const lowerDesc = desc.toLowerCase();
        // Exclude party platform inferences
        if (lowerDesc.includes('platform') || lowerDesc.includes('inferred from')) return false;
        // Must have actual evidence
        return desc.length > 10;
      };

      // Get vote counts per candidate (split by action type)
      // Use aggregated view to avoid the 1,000 row default limit on direct table selects
      const { data: votingCoverageData, error: votingCoverageError } = await supabase
        .from('candidate_voting_coverage')
        .select('candidate_id, total_votes_stored, legislative_actions_count, floor_votes_count');

      if (votingCoverageError) throw votingCoverageError;

      const voteCountMap: Record<string, { total: number; legislative: number; floor: number }> = {};
      (votingCoverageData || []).forEach(row => {
        if (!row.candidate_id) return;
        voteCountMap[row.candidate_id] = {
          total: row.total_votes_stored || 0,
          legislative: row.legislative_actions_count || 0,
          floor: row.floor_votes_count || 0
        };
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
        local_loans: number | null;
        fec_itemized: number | null;
        fec_unitemized: number | null;
        fec_total_receipts: number | null;
        fec_pac_contributions: number | null;
        fec_party_contributions: number | null;
        fec_loans: number | null;
        fec_transfers: number | null;
        fec_candidate_contribution: number | null;
        fec_other_receipts: number | null;
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
      // Include designation to filter: only P/A (campaign) committees count for sync status
      const { data: partialSyncData } = await supabase
        .from('candidate_committees')
        .select('candidate_id, has_more, last_sync_date, last_sync_completed_at, designation');

      const partialSyncMap: Record<string, boolean> = {};
      const lastSyncMap: Record<string, string | null> = {};
      const completeSyncMap: Record<string, boolean> = {};
      const committeeCountMap: Record<string, number> = {};
      
      (partialSyncData || []).forEach(row => {
        // Count ALL committees per candidate (for display purposes)
        committeeCountMap[row.candidate_id] = (committeeCountMap[row.candidate_id] || 0) + 1;
        
        // Only consider P/A (campaign) committees for sync status
        // External committees (J/U/B/D) are ignored for sync status calculation
        const isCampaignCommittee = ['P', 'A'].includes(row.designation || '');
        if (!isCampaignCommittee) return;
        
        // has_more = true means incomplete sync (only for P/A committees)
        if (row.has_more === true) {
          partialSyncMap[row.candidate_id] = true;
        }
        if (row.last_sync_date) {
          lastSyncMap[row.candidate_id] = row.last_sync_date;
        }
        // If any P/A committee has completed sync, mark it
        if (row.last_sync_completed_at) {
          completeSyncMap[row.candidate_id] = true;
        }
      });

      // Get vote sync status from vote_sync_status table
      const { data: voteSyncData } = await supabase
        .from('vote_sync_status')
        .select('candidate_id, expected_total, persisted_count, expected_floor_votes, persisted_floor_votes, last_sync_completed_at, sync_error, floor_vote_sync_error');

      interface VoteSyncRecord {
        candidate_id: string;
        expected_total: number | null;
        persisted_count: number | null;
        expected_floor_votes: number | null;
        persisted_floor_votes: number | null;
        last_sync_completed_at: string | null;
        sync_error: string | null;
        floor_vote_sync_error: string | null;
      }

      const voteSyncMap: Record<string, VoteSyncRecord> = {};
      (voteSyncData || []).forEach(row => {
        voteSyncMap[row.candidate_id] = row;
      });

      // Count answers and sourced answers per candidate
      const answerCountMap: Record<string, number> = {};
      const sourcedCountMap: Record<string, number> = {};
      allAnswers.forEach(row => {
        answerCountMap[row.candidate_id] = (answerCountMap[row.candidate_id] || 0) + 1;
        if (hasValidSource(row.source_description)) {
          sourcedCountMap[row.candidate_id] = (sourcedCountMap[row.candidate_id] || 0) + 1;
        }
      });

      // Helper to validate FEC ID prefix against office
      const validateFecIdPrefix = (fecId: string | null, office: string): { mismatch: boolean; reason: string | null } => {
        if (!fecId) return { mismatch: false, reason: null };
        
        const prefix = fecId.charAt(0).toUpperCase();
        const officeNormalized = office.toLowerCase();
        
        // Expected prefixes: H = House Representative, S = Senator, P = President
        const expectedPrefix = officeNormalized.includes('representative') || officeNormalized.includes('house') 
          ? 'H'
          : officeNormalized.includes('senator') || officeNormalized.includes('senate')
            ? 'S'
            : officeNormalized.includes('president')
              ? 'P'
              : null;
        
        if (!expectedPrefix) {
          // Unknown office type, can't validate
          return { mismatch: false, reason: null };
        }
        
        if (prefix !== expectedPrefix) {
          const prefixMeaning = prefix === 'H' ? 'House' : prefix === 'S' ? 'Senate' : prefix === 'P' ? 'President' : 'Unknown';
          return { 
            mismatch: true, 
            reason: `FEC ID starts with "${prefix}" (${prefixMeaning}) but office is "${office}"`
          };
        }
        
        return { mismatch: false, reason: null };
      };

      // Build result with coverage info
      const results: CandidateAnswerCoverage[] = (candidates || []).map(c => {
        const answerCount = answerCountMap[c.id] || 0;
        const sourcedCount = sourcedCountMap[c.id] || 0;
        const percentage = totalQuestions ? Math.round((answerCount / totalQuestions) * 100) : 0;
        const sourcePercentage = answerCount > 0 ? Math.round((sourcedCount / answerCount) * 100) : 0;
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
        
        // Validate FEC ID prefix
        const fecIdValidation = validateFecIdPrefix(c.fec_candidate_id, c.office);
        
        // Vote sync status (legislative actions)
        const voteSyncRecord = voteSyncMap[c.id];
        const expectedVoteCount = voteSyncRecord?.expected_total ?? null;
        const persistedVoteCount = voteSyncRecord?.persisted_count ?? 0;
        let voteSyncStatus: 'never' | 'partial' | 'complete' | 'error' = 'never';
        if (voteSyncRecord?.sync_error) {
          voteSyncStatus = 'error';
        } else if (voteSyncRecord) {
          if (expectedVoteCount !== null && persistedVoteCount < expectedVoteCount) {
            voteSyncStatus = 'partial';
          } else if (voteSyncRecord.last_sync_completed_at) {
            voteSyncStatus = 'complete';
          }
        }
        
        // Floor vote sync status
        const expectedFloorVotes = voteSyncRecord?.expected_floor_votes ?? null;
        const persistedFloorVotes = voteSyncRecord?.persisted_floor_votes ?? 0;
        let floorVoteSyncStatus: 'never' | 'partial' | 'complete' | 'error' = 'never';
        if (voteSyncRecord?.floor_vote_sync_error) {
          floorVoteSyncStatus = 'error';
        } else if (expectedFloorVotes !== null) {
          if (persistedFloorVotes < expectedFloorVotes) {
            floorVoteSyncStatus = 'partial';
          } else {
            floorVoteSyncStatus = 'complete';
          }
        }
        
        // Get vote counts from the view
        const voteCounts = voteCountMap[c.id] || { total: 0, legislative: 0, floor: 0 };
        
        return {
          id: c.id,
          name: c.name,
          party: c.party,
          office: c.office,
          state: c.state,
          answerCount,
          totalQuestions: totalQuestions || 0,
          percentage,
          sourcedCount,
          sourcePercentage,
          overallScore: c.overall_score ?? null,
          coverageTier: (c.coverage_tier as CoverageTier) || 'tier_3',
          confidence: (c.confidence as ConfidenceLevel) || 'low',
          voteCount: voteCounts.total,
          legislativeActionsCount: voteCounts.legislative,
          floorVotesCount: voteCounts.floor,
          expectedVoteCount,
          expectedFloorVotes,
          voteSyncStatus,
          floorVoteSyncStatus,
          lastVoteSyncAt: voteSyncRecord?.last_sync_completed_at || null,
          donorCount: donorCountMap[c.id] || 0,
          fecCandidateId: c.fec_candidate_id || null,
          fecCommitteeId: c.fec_committee_id || null,
          committeeCount: committeeCountMap[c.id] || 0,
          // Finance data from reconciliation table (single source of truth)
          localItemized: rec?.local_itemized || 0,
          localItemizedNet: rec?.local_itemized_net || 0, // NET for proper comparison
          localTransfers: rec?.local_transfers || 0,
          localEarmarked: rec?.local_earmarked || 0,
          localLoans: rec?.local_loans || 0,
          fecItemized: rec?.fec_itemized ?? null,
          fecUnitemized: rec?.fec_unitemized ?? null,
          fecTotalReceipts: rec?.fec_total_receipts ?? null,
          fecPacContributions: rec?.fec_pac_contributions || 0,
          fecPartyContributions: rec?.fec_party_contributions || 0,
          fecLoans: rec?.fec_loans || 0,
          fecTransfers: rec?.fec_transfers || 0,
          fecCandidateContribution: rec?.fec_candidate_contribution || 0,
          fecOtherReceipts: rec?.fec_other_receipts || 0,
          deltaAmount: rec?.delta_amount ?? null,
          deltaPct: rec?.delta_pct ?? null,
          reconciliationStatus: rec?.status || null,
          hasPartialSync,
          lastDonorSync: c.last_donor_sync || null,
          lastSyncDate: lastSyncMap[c.id] || null,
          reconciliationCheckedAt: rec?.checked_at || null,
          syncStatus,
          // Validation flags
          fecIdMismatch: fecIdValidation.mismatch,
          fecIdMismatchReason: fecIdValidation.reason,
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
