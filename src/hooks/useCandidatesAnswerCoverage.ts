import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CoverageTier, ConfidenceLevel } from '@/lib/scoreFormat';

export type CandidateSource = 'federal' | 'civic';
export type GovernmentLevel = 'federal_executive' | 'federal_legislative' | 'state_executive' | 'state_legislative' | 'local' | 'unknown';

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
  localOtherReceipts: number;    // Local Line 14 + Line 15 (offsets + other)
  // Category-level local data
  localIndividualItemized: number; // Individuals NET (excludes memo_code='X')
  localGrossIndividual: number;    // Individuals GROSS (includes memo_code='X' for FEC comparison)
  memoXAmount: number;             // Amount in memo_code='X' entries (gross - net)
  localPacContributions: number;   // PACs (Line 11C)
  localPartyContributions: number; // Party (Line 11B)
  localOrganization: number;       // Organizations (11A non-individual)
  // FEC category data
  fecItemized: number | null;    // FEC itemized contributions (individuals)
  fecUnitemized: number | null;  // FEC unitemized contributions
  fecTotalReceipts: number | null; // FEC total receipts
  fecPacContributions: number;   // FEC PAC contributions (line 11C)
  fecPartyContributions: number; // FEC party contributions
  fecLoans: number;              // Candidate loans
  fecTransfers: number;          // Committee transfers (line 12)
  fecCandidateContribution: number; // Candidate self-contribution (non-loan)
  fecOtherReceipts: number;      // Other receipts (Line 15)
  fecOffsetsToOperatingExpenditures: number; // Line 14 offsets
  // Overall delta (itemized comparison for data integrity)
  deltaAmount: number | null;    // Difference between local NET and FEC
  deltaPct: number | null;       // Percentage difference
  reconciliationStatus: string | null; // ok, warning, error
  // Total receipts delta (for UI display - matches FEC/Local columns)
  totalReceiptsDeltaAmount: number | null;
  totalReceiptsDeltaPct: number | null;
  // Category-level deltas
  individualDeltaAmount: number | null;
  individualDeltaPct: number | null;
  pacDeltaAmount: number | null;
  pacDeltaPct: number | null;
  // Sync status
  hasPartialSync: boolean;       // True if any committee has has_more = true (incomplete sync)
  lastDonorSync: string | null;  // Last donor sync date from candidates table
  lastSyncDate: string | null;   // Last sync date from committees
  reconciliationCheckedAt: string | null; // When reconciliation was last checked
  syncStatus: 'never' | 'partial' | 'complete'; // Aggregated sync status
  // Validation flags
  fecIdMismatch: boolean;
  fecIdMismatchReason: string | null;
  // Source tracking
  source: CandidateSource;
  level: GovernmentLevel;
}

interface Filters {
  party?: string;
  state?: string;
  coverageFilter?: 'all' | 'none' | 'low' | 'full';
  level?: 'all' | GovernmentLevel;
}

export function useCandidatesAnswerCoverage(filters: Filters = {}, options?: { enabled?: boolean; limit?: number }) {
  const limit = options?.limit;
  
  return useQuery({
    queryKey: ['candidates-answer-coverage', filters, limit ?? 'all'],
    enabled: options?.enabled !== false, // Default to true, but allow disabling
    placeholderData: (previousData) => previousData, // Keep previous data during filter transitions
    queryFn: async (): Promise<CandidateAnswerCoverage[]> => {
      // Get total questions count
      const { count: totalQuestions, error: questionsError } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true });

      if (questionsError) throw questionsError;

      // Get candidates with coverage tier and confidence
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

      // Apply limit for progressive loading (first N candidates)
      if (limit) {
        candidatesQuery = candidatesQuery.range(0, limit - 1);
      }

      const { data: candidates, error: candidatesError } = await candidatesQuery;

      if (candidatesError) throw candidatesError;

      // Get candidate IDs for filtering supporting queries (for faster progressive loading)
      const candidateIds = (candidates || []).map(c => c.id);
      
      // If no candidates, return early
      if (candidateIds.length === 0) {
        return [];
      }

      const FINANCE_CYCLE = '2024';

      // Run ALL supporting queries in parallel for maximum performance
      const [
        answerCoverageResult,
        votingCoverageResult,
        donorCountsResult,
        reconciliationResult,
        partialSyncResult,
        voteSyncResult
      ] = await Promise.all([
        // Answer counts - filter by candidate IDs
        supabase
          .from('candidate_answer_coverage_stats')
          .select('candidate_id, answer_count, sourced_count')
          .in('candidate_id', candidateIds),
        // Vote counts - filter by candidate IDs
        supabase
          .from('candidate_voting_coverage')
          .select('candidate_id, total_votes_stored, legislative_actions_count, floor_votes_count')
          .in('candidate_id', candidateIds),
        // Donor counts - filter by candidate IDs
        supabase
          .from('candidate_donor_counts')
          .select('candidate_id, donor_count')
          .in('candidate_id', candidateIds),
        // Finance reconciliation - filter by candidate IDs
        supabase
          .from('finance_reconciliation')
          .select('*')
          .eq('cycle', FINANCE_CYCLE)
          .in('candidate_id', candidateIds),
        // Committee sync status - filter by candidate IDs
        supabase
          .from('candidate_committees')
          .select('candidate_id, has_more, last_sync_date, last_sync_completed_at, designation')
          .in('candidate_id', candidateIds),
        // Vote sync status - filter by candidate IDs
        supabase
          .from('vote_sync_status')
          .select('candidate_id, expected_total, persisted_count, expected_floor_votes, persisted_floor_votes, last_sync_completed_at, sync_error, floor_vote_sync_error')
          .in('candidate_id', candidateIds),
      ]);

      // Extract data from results (errors are non-fatal for supporting data)
      const answerCoverageData = answerCoverageResult.data;
      const votingCoverageData = votingCoverageResult.data;
      const donorCountsData = donorCountsResult.data;
      const reconciliationData = reconciliationResult.data;
      const partialSyncData = partialSyncResult.data;
      const voteSyncData = voteSyncResult.data;

      // Build lookup maps for answer counts
      const answerCountMap: Record<string, number> = {};
      const sourcedCountMap: Record<string, number> = {};
      (answerCoverageData || []).forEach(row => {
        if (row.candidate_id) {
          answerCountMap[row.candidate_id] = Number(row.answer_count) || 0;
          sourcedCountMap[row.candidate_id] = Number(row.sourced_count) || 0;
        }
      });

      // Build lookup map for vote counts
      const voteCountMap: Record<string, { total: number; legislative: number; floor: number }> = {};
      (votingCoverageData || []).forEach(row => {
        if (!row.candidate_id) return;
        voteCountMap[row.candidate_id] = {
          total: row.total_votes_stored || 0,
          legislative: row.legislative_actions_count || 0,
          floor: row.floor_votes_count || 0
        };
      });

      // Build lookup map for donor counts
      const donorCountMap: Record<string, number> = {};
      (donorCountsData || []).forEach(row => {
        if (row.candidate_id) {
          donorCountMap[row.candidate_id] = Number(row.donor_count) || 0;
        }
      });

      // Build lookup map for reconciliation data
      interface ReconciliationRecord {
        candidate_id: string;
        local_itemized: number | null;
        local_itemized_net: number | null;
        local_transfers: number | null;
        local_earmarked: number | null;
        local_loans: number | null;
        local_other_receipts: number | null;
        local_individual_itemized: number | null;
        local_gross_individual: number | null;
        memo_x_amount: number | null;
        local_pac_contributions: number | null;
        local_party_contributions: number | null;
        local_organization: number | null;
        fec_itemized: number | null;
        fec_unitemized: number | null;
        fec_total_receipts: number | null;
        fec_pac_contributions: number | null;
        fec_party_contributions: number | null;
        fec_loans: number | null;
        fec_transfers: number | null;
        fec_candidate_contribution: number | null;
        fec_other_receipts: number | null;
        fec_offsets_to_operating_expenditures: number | null;
        delta_amount: number | null;
        delta_pct: number | null;
        individual_delta_amount: number | null;
        individual_delta_pct: number | null;
        pac_delta_amount: number | null;
        pac_delta_pct: number | null;
        total_receipts_delta_amount: number | null;
        total_receipts_delta_pct: number | null;
        status: string | null;
        checked_at: string | null;
      }

      const reconciliationMap: Record<string, ReconciliationRecord> = {};
      (reconciliationData || []).forEach(row => {
        reconciliationMap[row.candidate_id] = row;
      });

      // Build lookup maps for sync status
      const partialSyncMap: Record<string, boolean> = {};
      const lastSyncMap: Record<string, string | null> = {};
      const completeSyncMap: Record<string, boolean> = {};
      const committeeCountMap: Record<string, number> = {};
      
      (partialSyncData || []).forEach(row => {
        // Count ALL committees per candidate (for display purposes)
        committeeCountMap[row.candidate_id] = (committeeCountMap[row.candidate_id] || 0) + 1;
        
        // Only consider P/A (campaign) committees for sync status
        const isCampaignCommittee = ['P', 'A'].includes(row.designation || '');
        if (!isCampaignCommittee) return;
        
        if (row.has_more === true) {
          partialSyncMap[row.candidate_id] = true;
        }
        if (row.last_sync_date) {
          lastSyncMap[row.candidate_id] = row.last_sync_date;
        }
        if (row.last_sync_completed_at) {
          completeSyncMap[row.candidate_id] = true;
        }
      });

      // Build lookup map for vote sync status
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
          localOtherReceipts: rec?.local_other_receipts || 0, // Line 14 + 15
          // Category-level local data
          localIndividualItemized: rec?.local_individual_itemized || 0,
        localGrossIndividual: rec?.local_gross_individual ?? rec?.local_individual_itemized ?? 0,
        memoXAmount: rec?.memo_x_amount ?? 0,
          localPacContributions: rec?.local_pac_contributions || 0,
          localPartyContributions: rec?.local_party_contributions || 0,
          localOrganization: rec?.local_organization || 0,
          // FEC data
          fecItemized: rec?.fec_itemized ?? null,
          fecUnitemized: rec?.fec_unitemized ?? null,
          fecTotalReceipts: rec?.fec_total_receipts ?? null,
          fecPacContributions: rec?.fec_pac_contributions || 0,
          fecPartyContributions: rec?.fec_party_contributions || 0,
          fecLoans: rec?.fec_loans || 0,
          fecTransfers: rec?.fec_transfers || 0,
          fecCandidateContribution: rec?.fec_candidate_contribution || 0,
          fecOtherReceipts: rec?.fec_other_receipts || 0,
          fecOffsetsToOperatingExpenditures: rec?.fec_offsets_to_operating_expenditures || 0,
          // Overall delta
          deltaAmount: rec?.delta_amount ?? null,
          deltaPct: rec?.delta_pct ?? null,
          reconciliationStatus: rec?.status || null,
          // Total receipts delta (for UI display - matches FEC/Local columns)
          totalReceiptsDeltaAmount: rec?.total_receipts_delta_amount ?? null,
          totalReceiptsDeltaPct: rec?.total_receipts_delta_pct ?? null,
          // Category-level deltas
          individualDeltaAmount: rec?.individual_delta_amount ?? null,
          individualDeltaPct: rec?.individual_delta_pct ?? null,
          pacDeltaAmount: rec?.pac_delta_amount ?? null,
          pacDeltaPct: rec?.pac_delta_pct ?? null,
          // Sync status
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

// Progressive loading wrapper: loads first 20 instantly, then all in background
export function useCandidatesAnswerCoverageProgressive(filters: Filters = {}, options?: { enabled?: boolean }) {
  const INITIAL_LIMIT = 20;
  
  // Phase 1: Quick load first 20 candidates
  const initialQuery = useCandidatesAnswerCoverage(filters, { 
    ...options, 
    limit: INITIAL_LIMIT 
  });
  
  // Phase 2: Load ALL after initial is done (different query key due to limit)
  const fullQuery = useCandidatesAnswerCoverage(filters, { 
    enabled: options?.enabled !== false && initialQuery.isSuccess,
    // No limit = fetch all
  });
  
  // Merge: show initial data immediately, then swap to full data when ready
  const candidates = fullQuery.data ?? initialQuery.data;
  const isInitialLoading = initialQuery.isLoading;
  const isLoadingMore = initialQuery.isSuccess && fullQuery.isFetching;
  const totalLoaded = candidates?.length ?? 0;
  
  return {
    data: candidates,
    isLoading: isInitialLoading,
    isFetching: initialQuery.isFetching || fullQuery.isFetching,
    isLoadingMore,
    totalLoaded,
    refetch: fullQuery.refetch,
  };
}

export function useCandidateAnswerStats() {
  return useQuery({
    queryKey: ['candidate-answer-stats'],
    queryFn: async () => {
      // Parallel fetch: questions count, candidates count, and answer coverage stats
      const [questionsResult, candidatesResult, coverageResult] = await Promise.all([
        supabase.from('questions').select('*', { count: 'exact', head: true }),
        supabase.from('candidates').select('*', { count: 'exact', head: true }),
        supabase.from('candidate_answer_coverage_stats').select('candidate_id, answer_count'),
      ]);

      if (questionsResult.error) throw questionsResult.error;
      if (candidatesResult.error) throw candidatesResult.error;
      if (coverageResult.error) throw coverageResult.error;

      const totalQuestions = questionsResult.count || 0;
      const totalCandidates = candidatesResult.count || 0;
      const coverageData = coverageResult.data || [];

      // Calculate stats from aggregated view data
      const candidatesWithAnswers = coverageData.filter(r => (r.answer_count || 0) > 0);
      const noAnswers = totalCandidates - candidatesWithAnswers.length;
      
      const lowCoverage = candidatesWithAnswers.filter(r => {
        const count = r.answer_count || 0;
        const pct = totalQuestions ? (count / totalQuestions) * 100 : 0;
        return pct > 0 && pct < 50;
      }).length;
      
      const fullCoverage = candidatesWithAnswers.filter(r => {
        const count = r.answer_count || 0;
        return totalQuestions > 0 && count >= totalQuestions;
      }).length;

      return {
        totalCandidates,
        noAnswers,
        lowCoverage,
        fullCoverage,
        totalQuestions,
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
