import { useCallback, useEffect, useMemo, useState } from "react";
import { useHiddenStates } from "@/hooks/useHiddenStates";
import { Link } from "react-router-dom";
import { useSyncStats } from "@/hooks/useSyncStats";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

const PAGE_SIZE = 20;
import { useCandidatesAnswerCoverageProgressive, useUniqueStates, useRecalculateCoverageTiers, CandidateAnswerCoverage } from "@/hooks/useCandidatesAnswerCoverage";
import { useFinanceCycles } from "@/hooks/useFinanceCycles";
import { usePopulateCandidateAnswers } from "@/hooks/usePopulateCandidateAnswers";
import { useEnrichCandidateSources } from "@/hooks/useCandidateAnswers";
import { useFECIntegration } from "@/hooks/useFECIntegration";
import { useAdminErrors } from "@/hooks/useAdminErrors";
import { useCandidateOverrides } from "@/hooks/useCandidateOverrides";
import { useVotingRecordsSync } from "@/hooks/useVotingRecordsSync";
import { 
  useVotingRecordsStatsCache, 
  useCandidateAnswerStatsCache, 
  useFecStatsCache,
  useRefreshAdminStats,
  type VotingRecordsStats,
  type CandidateAnswerStats,
  type FecStats
} from "@/hooks/useAdminStatsCache";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, RefreshCw, BarChart3, Users, FileText, HelpCircle, Search, Plus, ExternalLink, CheckCircle2, Pause, Play, X, AlertTriangle, Calculator, Vote, DollarSign, Link2, RotateCcw, ChevronDown, Sparkles, Building2, Download, Copy, Edit, Zap, MoreHorizontal, Check, Brain, ChevronsRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { CoverageTierBadge } from "@/components/CoverageTierBadge";
import { CommitteeBreakdown } from "@/components/admin/CommitteeBreakdown";
import { CommitteeLinkStatusBadge } from "@/components/admin/CommitteeLinkStatusBadge";
import { FinanceSummaryCard, type FinanceSummaryData } from "@/components/FinanceSummaryCard";
import { RecentErrorsPanel } from "@/components/admin/RecentErrorsPanel";
import { SyncStatusBadge } from "@/components/admin/SyncStatusBadge";
import { FinanceStatusBadge } from "@/components/admin/FinanceStatusBadge";
import { DeltaBadge } from "@/components/admin/DeltaBadge";
import { FinanceCategoryBreakdown } from "@/components/admin/FinanceCategoryBreakdown";
import { CandidateHealthBadge } from "@/components/admin/CandidateHealthBadge";
import { CandidateEditDialog } from "@/components/admin/CandidateEditDialog";
import { CandidateAnswersDialog } from "@/components/admin/CandidateAnswersDialog";
import { BackfillAnswersControl } from "@/components/admin/BackfillAnswersControl";
import { ColumnHeaderFilter } from "@/components/admin/ColumnHeaderFilter";
import { ProcessingStatusIndicator } from "@/components/admin/ProcessingStatusIndicator";
import { ScoreTextInline } from "@/components/ScoreText";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBackgroundProcessing } from "@/context/BackgroundProcessingContext";

const PARTIES = ['all', 'Democrat', 'Republican', 'Independent', 'Other'] as const;

function getPartyBadgeColor(party: string) {
  switch (party) {
    case 'Democrat': return 'bg-flag-blue text-white';
    case 'Republican': return 'bg-flag-red text-white';
    case 'Independent': return 'bg-purple-600 text-white';
    default: return 'bg-muted text-muted-foreground';
  }
}

function getPartyBadge(party: string) {
  switch (party) {
    case "Democrat": return "D";
    case "Republican": return "R";
    case "Independent": return "I";
    default: return "O";
  }
}

function getCoverageColor(percent: number) {
  if (percent >= 50) return "text-green-600 dark:text-green-400";
  if (percent >= 20) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

/**
 * Get the date range description for a given FEC election cycle.
 * FEC cycles are 2-year periods ending in even years:
 * - Cycle 2026 = Jan 1, 2023 - Dec 31, 2024
 * - Cycle 2022 = Jan 1, 2021 - Dec 31, 2022
 */
function getCycleDateRange(cycle: string): string {
  const cycleYear = parseInt(cycle);
  const startYear = cycleYear - 1;
  return `Jan ${startYear} – Dec ${cycleYear}`;
}

// Removed TopicCoverageItem - no longer needed

export function AnswerCoveragePanel() {
  const { data: syncStats, isLoading: syncLoading, refetch: refetchSyncStats, isRefetching } = useSyncStats();
  const { data: states } = useUniqueStates();
  const { isHidden: isStateHidden } = useHiddenStates();
  const visibleStates = useMemo(
    () => (states ?? []).filter((s) => !isStateHidden(s)),
    [states, isStateHidden]
  );
  
  // Use cached stats instead of direct queries
  const { data: candidateStatsCache, isLoading: statsLoading } = useCandidateAnswerStatsCache();
  const { data: votingStatsCache, isLoading: votingStatsLoading } = useVotingRecordsStatsCache();
  const { data: fecStatsCache, isLoading: fecStatsLoading } = useFecStatsCache();
  const { mutate: refreshStats, isPending: isRefreshingStats } = useRefreshAdminStats();
  
  // Track which refresh just completed for checkmark animation
  const [justRefreshed, setJustRefreshed] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [partyFilter, setPartyFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');
  useEffect(() => {
    if (stateFilter !== 'all' && isStateHidden(stateFilter)) setStateFilter('all');
  }, [stateFilter, isStateHidden]);
  const [coverageFilter, setCoverageFilter] = useState<'all' | 'none' | 'low' | 'full'>('all');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [financeFilter, setFinanceFilter] = useState<'all' | 'mismatch'>('all');
  const [deltaFilter, setDeltaFilter] = useState<'all' | 'within' | 'minor' | 'major' | 'no_data'>('all');
  const [syncFilter, setSyncFilter] = useState<'all' | 'needs_sync' | 'partial' | 'complete' | 'has_committee' | 'no_committee' | 'has_donors' | 'no_donors' | 'fec_mismatch'>('all');
  const [scoreFilter, setScoreFilter] = useState<'all' | 'left' | 'center' | 'right'>('all');
  const [tierFilter, setTierFilter] = useState<'all' | 'T1' | 'T2' | 'T3'>('all');
  const [fecIdFilter, setFecIdFilter] = useState<'all' | 'has_id' | 'missing' | 'mismatch'>('all');

  // Finance cycle selector (drives $, FEC, Local, Delta columns and finance actions)
  const { data: availableCycles } = useFinanceCycles();
  const [financeCycle, setFinanceCycleState] = useState<string>(() => {
    if (typeof window === 'undefined') return '2026';
    return localStorage.getItem('admin.financeCycle') ?? '2026';
  });
  const setFinanceCycle = useCallback((cycle: string) => {
    setFinanceCycleState(cycle);
    try { localStorage.setItem('admin.financeCycle', cycle); } catch {}
  }, []);
  // If persisted cycle disappears from the available list, snap to newest
  useEffect(() => {
    if (!availableCycles || availableCycles.length === 0) return;
    if (!availableCycles.includes(financeCycle)) {
      setFinanceCycle(availableCycles[0]);
    }
  }, [availableCycles, financeCycle, setFinanceCycle]);
  
  // Edit dialog state
  const [editingCandidate, setEditingCandidate] = useState<CandidateAnswerCoverage | null>(null);
  const [editDialogTab, setEditDialogTab] = useState<'details' | 'fec'>('details');
  
  // Answer management dialog state
  const [answerDialogCandidate, setAnswerDialogCandidate] = useState<{ id: string; name: string } | null>(null);
  
  // Batch reconciliation state
  const [isBatchReconciling, setIsBatchReconciling] = useState(false);
  
  // Civic AI research state
  const [civicResearchingIds, setCivicResearchingIds] = useState<Set<string>>(new Set());
  
  const handleCivicResearch = async (candidateId: string, name: string) => {
    setCivicResearchingIds(prev => new Set(prev).add(candidateId));
    try {
      const { error } = await supabase.functions.invoke('populate-civic-answers', {
        body: { candidateId },
      });
      if (error) throw error;
      toast.success(`AI research started for ${name}`);
    } catch (err) {
      console.error('Error starting civic research:', err);
      toast.error(`Failed to start research for ${name}`);
    } finally {
      setCivicResearchingIds(prev => {
        const next = new Set(prev);
        next.delete(candidateId);
        return next;
      });
    }
  };
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Check if any filter is selected (defer loading until filter is applied)
  const hasSelectedFilters = partyFilter !== 'all' || 
    stateFilter !== 'all' || 
    coverageFilter !== 'all' || 
    levelFilter !== 'all' ||
    searchQuery.length > 0 ||
    financeFilter !== 'all' ||
    deltaFilter !== 'all' ||
    syncFilter !== 'all' ||
    scoreFilter !== 'all' ||
    tierFilter !== 'all' ||
    fecIdFilter !== 'all';

  // Memoize filter object to prevent unnecessary query key changes
  const queryFilters = useMemo(() => ({
    party: partyFilter,
    state: stateFilter,
    coverageFilter,
    level: levelFilter as any,
  }), [partyFilter, stateFilter, coverageFilter, levelFilter]);

  const { data: candidates, isLoading: candidatesLoading, isFetching: candidatesFetching, isLoadingMore, refetch: refetchCandidates } = useCandidatesAnswerCoverageProgressive(
    queryFilters,
    { enabled: hasSelectedFilters, financeCycle }
  );
  
  // Error tracking for Phase 2
  const { errors: adminErrors, addError, dismissError, clearErrors, hasRecentError } = useAdminErrors();
  
  // Override tracking for Phase 3
  const { data: allOverrides } = useCandidateOverrides();
  const overrideMap = useMemo(() => {
    const map = new Map<string, boolean>();
    allOverrides?.forEach(o => map.set(o.candidate_id, true));
    return map;
  }, [allOverrides]);

  const { populateCandidate, populateBatch, pauseBatch, resumeBatch, cancelBatch, isLoading, isBatchRunning, batchProgress } = usePopulateCandidateAnswers();
  const { jobs: backgroundJobs, removeJob: removeBackgroundJob, clearAllJobs: clearAllBackgroundJobs, retryJob: retryBackgroundJob, isProcessing: isBackgroundProcessing } = useBackgroundProcessing();
  const { recalculateAll, isRecalculatingAll } = useRecalculateCoverageTiers();
  const { mutate: enrichSources, isPending: isEnrichingSource } = useEnrichCandidateSources();
  const { 
    syncAllVotes, 
    syncAllFloorVotes,
    syncSingleMember, 
    syncSingleMemberFloorVotes,
    progress: voteSyncProgress, 
    floorVoteProgress,
    issyncing: isVoteSyncing,
    isFloorVoteSyncing 
  } = useVotingRecordsSync();
  const { 
    fetchFECCandidateId, 
    fetchFECCommittees,
    fetchFECDonorsComplete,
    autoResumeSingleCandidate,
    forceResyncDonors,
    batchFetchFECIds,
    batchFetchDonors,
    resumeAllPartialSyncs,
    syncAllCandidatesComplete,
    cancelSyncAll,
    clearSyncAllProgress,
    triggerReconciliation,
    runBatchReconciliation,
    refreshFECTotals,
    batchRefreshFECTotals,
    isLoading: isFECLoading, 
    isDonorLoading,
    isCommitteeLoading,
    isReconcileLoading,
    isTotalsLoading,
    hasPartialSync,
    batchProgress: fecBatchProgress,
    isBatchRunning: isFECBatchRunning,
    syncProgress,
    syncAllProgress,
    isSyncAllRunning,
    isTotalsRefreshing,
    highVolumeMode,
    setHighVolumeMode
  } = useFECIntegration();
  
  const baseFilteredCandidates = useMemo(() => (
    candidates?.filter(c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase())
    ) || []
  ), [candidates, searchQuery]);

  // Finance status now uses the standardized formula: Total = Itemized + Unitemized + Other
  const calculateFinanceStatus = useCallback((candidate: CandidateAnswerCoverage) => {
    const fecItemized = candidate.fecItemized;
    const fecUnitemized = candidate.fecUnitemized || 0;
    const fecTotalReceipts = candidate.fecTotalReceipts;
    
    if (fecTotalReceipts === null || fecTotalReceipts === undefined) {
      return { 
        hasData: false, 
        fecItemized: null, 
        fecUnitemized: null,
        fecTotalReceipts: null, 
        otherReceipts: 0,
        isBalanced: true,
        status: candidate.reconciliationStatus
      };
    }
    
    // Calculate Other Receipts = Total - Itemized - Unitemized
    const otherReceipts = fecTotalReceipts - (fecItemized ?? 0) - fecUnitemized;
    
    // Validate the formula
    const calculatedTotal = (fecItemized ?? 0) + fecUnitemized + otherReceipts;
    const isBalanced = Math.abs(calculatedTotal - fecTotalReceipts) < 1;
    
    return {
      hasData: true,
      fecItemized,
      fecUnitemized,
      fecTotalReceipts,
      otherReceipts,
      isBalanced,
      status: candidate.reconciliationStatus
    };
  }, []);

  const formatCurrency = (value?: number | null, _compact = false) => {
    if (value === null || value === undefined) return '—';
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
    if (abs >= 10_000_000) return `${sign}$${Math.round(abs / 1_000_000)}M`;
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
    return `${sign}$${Math.round(abs)}`;
  };

  // FEC stats from cache (moved to line 516)

  // Source coverage stats from cached stats (stable, doesn't change on filter)
  const sourceStats = useMemo(() => {
    const stats = candidateStatsCache?.data;
    const totalSourced = stats?.totalSourced || 0;
    const totalAnswers = stats?.totalAnswers || 0;
    const sourcePercentage = totalAnswers > 0 ? Math.round((totalSourced / totalAnswers) * 100) : 0;
    return { totalSourced, totalAnswers, sourcePercentage };
  }, [candidateStatsCache]);

  const getSourceBadgeColor = (percentage: number) => {
    if (percentage >= 70) return 'bg-green-600 text-white';
    if (percentage >= 40) return 'bg-amber-500 text-white';
    return 'bg-red-500 text-white';
  };

  const getSourceDotColor = (percentage: number) => {
    if (percentage >= 70) return 'bg-green-500';
    if (percentage >= 40) return 'bg-amber-500';
    return 'bg-red-500';
  };

  // Get counts for batch action buttons (from filtered candidates)
  const partialSyncCandidates = useMemo(() => 
    baseFilteredCandidates.filter(c => c.syncStatus === 'partial' && c.fecCandidateId),
    [baseFilteredCandidates]
  );

  const needsSyncCandidates = useMemo(() => 
    baseFilteredCandidates.filter(c => (c.syncStatus === 'never' || c.syncStatus === 'partial') && c.fecCandidateId),
    [baseFilteredCandidates]
  );

  const completeSyncCandidates = useMemo(() => 
    baseFilteredCandidates.filter(c => c.syncStatus === 'complete'),
    [baseFilteredCandidates]
  );

  const noCommitteeCandidates = useMemo(() => 
    baseFilteredCandidates.filter(c => c.fecCandidateId && !c.fecCommitteeId),
    [baseFilteredCandidates]
  );

  const candidatesWithoutFecId = useMemo(() => 
    baseFilteredCandidates.filter(c => !c.fecCandidateId),
    [baseFilteredCandidates]
  );

  const candidatesWithFecId = useMemo(() => 
    baseFilteredCandidates.filter(c => !!c.fecCandidateId),
    [baseFilteredCandidates]
  );

  const fecIdMismatchCandidates = useMemo(() => 
    baseFilteredCandidates.filter(c => c.fecIdMismatch),
    [baseFilteredCandidates]
  );

  const filteredCandidates = useMemo(() => {
    let result = baseFilteredCandidates;
    
    // Apply finance filter
    if (financeFilter === 'mismatch') {
      result = result.filter(candidate => {
        const status = candidate.reconciliationStatus;
        return status === 'warning' || status === 'error';
      });
    }
    
    // Apply delta filter
    if (deltaFilter !== 'all') {
      result = result.filter(candidate => {
        const deltaPct = candidate.deltaPct;
        
        if (deltaFilter === 'no_data') {
          return deltaPct === null || deltaPct === undefined;
        }
        
        if (deltaPct === null || deltaPct === undefined) {
          return false;
        }
        
        const absPct = Math.abs(deltaPct);
        
        switch (deltaFilter) {
          case 'within':
            return absPct <= 2;
          case 'minor':
            return absPct > 2 && absPct <= 5;
          case 'major':
            return absPct > 5;
          default:
            return true;
        }
      });
    }
    
    // Apply sync filter
    if (syncFilter === 'needs_sync') {
      result = result.filter(c => (c.syncStatus === 'never' || c.syncStatus === 'partial') && c.fecCandidateId);
    } else if (syncFilter === 'partial') {
      result = result.filter(c => c.syncStatus === 'partial');
    } else if (syncFilter === 'complete') {
      result = result.filter(c => c.syncStatus === 'complete');
    } else if (syncFilter === 'no_committee') {
      result = result.filter(c => c.fecCandidateId && !c.fecCommitteeId);
    } else if (syncFilter === 'has_committee') {
      result = result.filter(c => !!c.fecCommitteeId);
    } else if (syncFilter === 'fec_mismatch') {
      result = result.filter(c => c.fecIdMismatch);
    } else if (syncFilter === 'has_donors') {
      result = result.filter(c => c.donorCount > 0);
    } else if (syncFilter === 'no_donors') {
      result = result.filter(c => c.donorCount === 0);
    }
    
    // Apply score filter
    if (scoreFilter === 'left') {
      result = result.filter(c => c.overallScore !== null && c.overallScore < -3);
    } else if (scoreFilter === 'center') {
      result = result.filter(c => c.overallScore !== null && c.overallScore >= -3 && c.overallScore <= 3);
    } else if (scoreFilter === 'right') {
      result = result.filter(c => c.overallScore !== null && c.overallScore > 3);
    }
    
    // Apply tier filter
    if (tierFilter === 'T1') {
      result = result.filter(c => c.coverageTier === 'tier_1');
    } else if (tierFilter === 'T2') {
      result = result.filter(c => c.coverageTier === 'tier_2');
    } else if (tierFilter === 'T3') {
      result = result.filter(c => c.coverageTier === 'tier_3');
    }
    
    // Apply FEC ID filter
    if (fecIdFilter === 'has_id') {
      result = result.filter(c => !!c.fecCandidateId);
    } else if (fecIdFilter === 'missing') {
      result = result.filter(c => !c.fecCandidateId);
    } else if (fecIdFilter === 'mismatch') {
      result = result.filter(c => c.fecIdMismatch);
    }
    
    return result;
  }, [baseFilteredCandidates, financeFilter, deltaFilter, syncFilter, scoreFilter, tierFilter, fecIdFilter]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredCandidates.length / PAGE_SIZE);
  const paginatedCandidates = filteredCandidates.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  // Reset to page 1 when any filter changes
  const filterDependencies = [partyFilter, stateFilter, coverageFilter, levelFilter, searchQuery, financeFilter, deltaFilter, syncFilter, scoreFilter, tierFilter, fecIdFilter];
  useMemo(() => {
    setCurrentPage(1);
  }, filterDependencies);

  const handleFillAll = async () => {
    try {
      if (!candidates) return;
      const toProcess = candidates.filter(c => c.answerCount === 0).slice(0, 50);
      await populateBatch(toProcess.map(c => ({ id: c.id, name: c.name })), false);
    } catch (err) {
      console.error('[Admin] Fill missing failed:', err);
      toast.error('Failed to generate AI answers batch');
    }
  };

  const handleFillLowCoverage = async () => {
    try {
      if (!candidates) return;
      const toProcess = candidates.filter(c => c.percentage > 0 && c.percentage < 50).slice(0, 50);
      await populateBatch(toProcess.map(c => ({ id: c.id, name: c.name })), true);
    } catch (err) {
      console.error('[Admin] Regen low coverage failed:', err);
      toast.error('Failed to regenerate low coverage batch');
    }
  };

  const handleBatchLinkFECIds = async () => {
    try {
      const toProcess = candidatesWithoutFecId.slice(0, 50).map(c => ({ id: c.id, name: c.name, state: c.state }));
      if (toProcess.length === 0) {
        toast.info('All candidates already have FEC IDs');
        return;
      }
      const results = await batchFetchFECIds(toProcess);
      toast.success(`Linked ${results.success} FEC IDs (${results.failed} failed)`);
      refetchCandidates();
    } catch (err) {
      console.error('[Admin] Batch link FEC IDs failed:', err);
      toast.error('Failed to link FEC IDs');
    }
  };

  const handleBatchLinkCommittees = async () => {
    try {
      const toProcess = noCommitteeCandidates.slice(0, 50);
      if (toProcess.length === 0) {
        toast.info('All candidates with FEC IDs already have committees linked');
        return;
      }
      
      let success = 0;
      let failed = 0;
      
      for (const candidate of toProcess) {
        try {
          await fetchFECCommittees(candidate.id, candidate.fecCandidateId!);
          success++;
        } catch (err) {
          console.error(`[Admin] Failed to link committees for ${candidate.name}:`, err);
          failed++;
        }
      }
      
      toast.success(`Linked committees for ${success} candidates (${failed} failed)`);
      refetchCandidates();
    } catch (err) {
      console.error('[Admin] Batch link committees failed:', err);
      toast.error('Failed to link committees');
    }
  };

  const handleBatchFetchDonors = async () => {
    try {
      const toProcess = candidatesWithFecId.slice(0, 50).map(c => ({
        id: c.id,
        name: c.name,
        fecCandidateId: c.fecCandidateId!
      }));
      if (toProcess.length === 0) {
        toast.info('No candidates with FEC IDs found. Link FEC IDs first.');
        return;
      }
      const results = await batchFetchDonors(toProcess, financeCycle);
      toast.success(
        `Imported ${results.totalImported} donors for ${results.success} candidates ` +
        `($${results.totalRaised.toLocaleString()} total)`
      );
      refetchCandidates();
    } catch (err) {
      console.error('[Admin] Batch fetch donors failed:', err);
      toast.error('Failed to fetch donors batch');
    }
  };

  const handleResumeAllPartialSyncs = async () => {
    try {
      const toProcess = partialSyncCandidates.map(c => ({
        id: c.id,
        name: c.name,
        fecCandidateId: c.fecCandidateId!
      }));
      const results = await resumeAllPartialSyncs(toProcess, financeCycle);
      toast.success(
        `Resumed ${results.resumed} syncs: ${results.completed} completed, ` +
        `${results.stillPartial} still partial. ` +
        `Imported ${results.totalImported} additional donors.`
      );
      refetchCandidates();
    } catch (err) {
      console.error('[Admin] Resume partial syncs failed:', err);
      toast.error('Failed to resume donor syncs');
    }
  };

  const handleBatchRefreshFECTotals = async () => {
    try {
      const toProcess = candidatesWithFecId.map(c => c.id);
      if (toProcess.length === 0) {
        toast.info('No candidates with FEC IDs found.');
        return;
      }
      toast.info(`Refreshing FEC totals for ${toProcess.length} candidates...`);
      const results = await batchRefreshFECTotals(toProcess, financeCycle);
      toast.success(
        `Refreshed FEC totals: ${results.success} succeeded, ${results.failed} failed, ${results.skipped} skipped`
      );
      refetchCandidates();
    } catch (err) {
      console.error('[Admin] Batch refresh FEC totals failed:', err);
      toast.error('Failed to refresh FEC totals');
    }
  };

  // Use cached stats
  const candidateStats = candidateStatsCache?.data;
  const votingStats = votingStatsCache?.data;
  const fecStats = fecStatsCache?.data ?? { withFecId: 0, neverSynced: 0, partialSync: 0, complete: 0 };

  const noAnswersCount = candidateStats?.noAnswers || 0;
  const lowCoverageCount = candidateStats?.lowCoverage || 0;
  const visibleUnansweredCount = paginatedCandidates.filter(c => c.answerCount === 0).length;

  // Only show full loading spinner on initial load (when no cached data exists)
  const isInitialLoading = (statsLoading || votingStatsLoading || fecStatsLoading || syncLoading) && !candidateStatsCache;
  const anyBatchRunning = isBatchRunning || isFECBatchRunning || isSyncAllRunning;
  // Show subtle indicator when candidate list is refetching (filter changes)
  const isTableRefetching = candidatesFetching && !candidatesLoading;

  if (isInitialLoading) {
    return (
      <Card className="mb-8">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-8">
      {/* Background bulk sync indicator */}
      {(isVoteSyncing || isFloorVoteSyncing) && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-4 py-2 flex items-center gap-2 rounded-t-lg">
          <Loader2 className="h-4 w-4 animate-spin text-amber-600 dark:text-amber-400" />
          <span className="text-sm text-amber-800 dark:text-amber-200">
            Bulk sync in progress: {isVoteSyncing && 'Legislation'}{isVoteSyncing && isFloorVoteSyncing && ' & '}{isFloorVoteSyncing && 'Floor Votes'}
            {voteSyncProgress && ` (${voteSyncProgress.completed}/${voteSyncProgress.total} legislators)`}
            {floorVoteProgress && ` (${floorVoteProgress.completed}/${floorVoteProgress.total} legislators)`}
          </span>
          <span className="text-xs text-amber-600 dark:text-amber-400 ml-auto">
            Individual row updates will reflect mixed results until complete
          </span>
        </div>
      )}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
          <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Coverage & Finance Dashboard
              <Badge variant="outline" className="ml-2 text-xs font-normal">
                Cycle {financeCycle} ({getCycleDateRange(financeCycle)})
              </Badge>
            </CardTitle>
            <CardDescription>
              Unified view of AI position answers, FEC donors, and finance reconciliation
            </CardDescription>
          </div>
          
          <div className="flex items-center gap-2">
            
            {/* AI Actions Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={anyBatchRunning}>
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  AI Actions
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} disabled={noAnswersCount === 0}>
                      <Plus className="h-4 w-4 mr-2" />
                      Generate for Empty Profiles ({Math.min(noAnswersCount, 50)})
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Generate AI Position Answers?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Generates AI-inferred position answers for up to 50 candidates who have no answers yet.
                        Uses voting records, public statements, and party platform as sources.
                        Takes 2-5 minutes.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleFillAll}>Generate</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} disabled={lowCoverageCount === 0}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh Incomplete Profiles ({Math.min(lowCoverageCount, 50)})
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Refresh Incomplete Profile Answers?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Re-generates AI answers for up to 50 candidates with less than 50% question coverage.
                        Replaces existing answers with fresh analysis from voting records and statements.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleFillLowCoverage}>Regenerate</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                
                <DropdownMenuSeparator />
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Calculator className="h-4 w-4 mr-2" />
                      Recalculate Coverage Tiers
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Recalculate All Coverage Tiers?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will recalculate coverage tiers and confidence levels for all candidates:
                        <ul className="list-disc pl-4 mt-2 space-y-1 text-sm">
                          <li><strong>tier_1</strong>: ≥80% answers AND has votes or donors</li>
                          <li><strong>tier_2</strong>: ≥30% answers OR has votes or donors</li>
                          <li><strong>tier_3</strong>: Less than 30% answers, no votes/donors</li>
                        </ul>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={async () => {
                        try {
                          const result = await recalculateAll();
                          toast.success(`Coverage tiers recalculated: ${result?.[0]?.updated_count || 0} updated`);
                        } catch {
                          toast.error('Failed to recalculate coverage tiers');
                        }
                      }}>Recalculate</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* FEC Actions Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={anyBatchRunning}>
                  <DollarSign className="h-4 w-4 mr-1.5" />
                  FEC Actions
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Link2 className="h-4 w-4 mr-2" />
                      Find FEC Candidate IDs ({candidatesWithoutFecId.length})
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Search FEC for Candidate IDs?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Searches the FEC database to find and link FEC candidate IDs for {candidatesWithoutFecId.length} candidates
                        who don't have one yet. Required before importing donor data. Processes up to 50 at a time.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleBatchLinkFECIds}>Find & Link IDs</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Building2 className="h-4 w-4 mr-2" />
                      Fetch Campaign Committees ({noCommitteeCandidates.length})
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Fetch Campaign Committees from FEC?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Fetches all FEC-registered campaign committees for {noCommitteeCandidates.length} candidates 
                        who have FEC IDs but no linked committees. Required before importing donor contributions.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleBatchLinkCommittees}>Fetch Committees</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <DollarSign className="h-4 w-4 mr-2" />
                      Import Donor Contributions ({candidatesWithFecId.length})
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Import Itemized Contributions from FEC?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Downloads all itemized ($200+) contributions from FEC for candidates with linked committees.
                        Imports donor names, amounts, employers, and dates. Processes up to 50 candidates. Takes 5-15 minutes.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleBatchFetchDonors}>Import Contributions</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                
                {partialSyncCandidates.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem 
                          onSelect={(e) => e.preventDefault()}
                          className="text-amber-600"
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Complete Interrupted Syncs ({partialSyncCandidates.length})
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Complete Interrupted Donor Syncs?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {partialSyncCandidates.length} candidates have incomplete donor imports (sync was interrupted).
                            This continues downloading from where each sync stopped until all data is imported.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleResumeAllPartialSyncs}>Complete All</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
                
                <DropdownMenuSeparator />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem 
                      onSelect={(e) => e.preventDefault()}
                      className="text-green-600 font-medium"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Full Donor Sync (All Candidates)
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Run Full Donor Sync for All Candidates?</AlertDialogTitle>
                      <AlertDialogDescription className="space-y-2">
                        <p>
                          Imports ALL itemized contributions for every candidate with an FEC ID.
                          Runs continuously in your browser until complete.
                        </p>
                        <ul className="list-disc pl-4 text-sm space-y-1">
                          <li>New candidates: Full import from scratch</li>
                          <li>Partial syncs: Continues from where they stopped</li>
                          <li>⏱️ Takes 1-4 hours depending on data volume</li>
                          <li>You can stop anytime with the Stop button</li>
                        </ul>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => syncAllCandidatesComplete(financeCycle)}
                        className="bg-green-600 hover:bg-green-700"
                      >Start Full Sync</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                
                <DropdownMenuSeparator />
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem 
                      onSelect={(e) => e.preventDefault()}
                      className="text-blue-600"
                      disabled={isTotalsRefreshing}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Update FEC Summary Totals ({candidatesWithFecId.length})
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Update FEC Summary Totals?</AlertDialogTitle>
                      <AlertDialogDescription className="space-y-2">
                        <p>
                          Fetches the latest FEC summary totals (total raised, itemized, unitemized) for all candidates.
                        </p>
                        <p className="text-sm font-medium text-muted-foreground">
                          ⚡ Fast operation — only updates totals, doesn't re-import contributions.
                          Use this to fix $0 totals caused by rate limiting during bulk imports.
                        </p>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleBatchRefreshFECTotals}
                        className="bg-blue-600 hover:bg-blue-700"
                      >Update Totals</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                
                <DropdownMenuSeparator />
                
                <DropdownMenuItem 
                  onSelect={async (e) => {
                    e.preventDefault();
                    setIsBatchReconciling(true);
                    try {
                      const result = await runBatchReconciliation(financeCycle, 200);
                      toast.success(`Reconciliation complete: ${result.success} OK, ${result.warnings} warnings, ${result.failed} errors`);
                      refetchCandidates();
                    } catch (err) {
                      console.error('[Admin] Batch reconciliation failed:', err);
                      toast.error('Failed to run reconciliation');
                    } finally {
                      setIsBatchReconciling(false);
                    }
                  }}
                  className="text-purple-600"
                  disabled={isBatchReconciling}
                >
                  {isBatchReconciling ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Calculator className="h-4 w-4 mr-2" />
                  )}
                  Run Reconciliation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Refresh button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetchCandidates()}
              disabled={isRefetching}
            >
              {isRefetching || isRecalculatingAll ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Overall Stats Grid - Candidate Answer Stats */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Candidate Answers</span>
            <div className="flex items-center gap-2">
              {candidateStatsCache?.updatedAt && (
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(candidateStatsCache.updatedAt), { addSuffix: true })}
                </span>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => {
                        refreshStats("candidate_answer_stats", {
                          onSuccess: () => {
                            setJustRefreshed("candidate_answer_stats");
                            setTimeout(() => setJustRefreshed(null), 2000);
                          }
                        });
                      }}
                      disabled={isRefreshingStats}
                    >
                      {justRefreshed === "candidate_answer_stats" ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      ) : isRefreshingStats ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Refresh candidate answer stats</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Users className="h-4 w-4" />
                Total Reps
              </div>
              <div className="text-2xl font-bold">{candidateStats?.totalCandidates?.toLocaleString() || 0}</div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <HelpCircle className="h-4 w-4" />
                Total Questions
              </div>
              <div className="text-2xl font-bold">{candidateStats?.totalQuestions?.toLocaleString() || 0}</div>
            </div>

            <div className="bg-amber-500/10 rounded-lg p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <FileText className="h-4 w-4 text-amber-600" />
                No Answers
              </div>
              <div className="text-2xl font-bold text-amber-600">{candidateStats?.noAnswers || 0}</div>
            </div>

            <div className="bg-green-500/10 rounded-lg p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Full Coverage
              </div>
              <div className="text-2xl font-bold text-green-600">{candidateStats?.fullCoverage || 0}</div>
            </div>
          </div>
        </div>

        {/* Source Coverage Stats */}
        <div className="bg-muted/30 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <FileText className="h-4 w-4" />
              <span>Source Quality</span>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 text-sm">
                  <p className="font-medium mb-1">Source Quality</p>
                  <p className="text-muted-foreground">
                    Percentage of answers with specific, verifiable sources (voting records, cosponsored bills, public statements)
                    rather than party platform inferences.
                  </p>
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {sourceStats.totalSourced.toLocaleString()} / {sourceStats.totalAnswers.toLocaleString()} answers with sources
              </span>
              <Badge className={getSourceBadgeColor(sourceStats.sourcePercentage)}>
                {sourceStats.sourcePercentage}% sourced
              </Badge>
            </div>
          </div>
        </div>

        {/* FEC Sync Stats */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">FEC Data</span>
            <div className="flex items-center gap-2">
              {fecStatsCache?.updatedAt && (
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(fecStatsCache.updatedAt), { addSuffix: true })}
                </span>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => {
                        refreshStats("fec_stats", {
                          onSuccess: () => {
                            setJustRefreshed("fec_stats");
                            setTimeout(() => setJustRefreshed(null), 2000);
                          }
                        });
                      }}
                      disabled={isRefreshingStats}
                    >
                      {justRefreshed === "fec_stats" ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      ) : isRefreshingStats ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Refresh FEC stats</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Link2 className="h-4 w-4" />
              With FEC ID
            </div>
            <div className="text-2xl font-bold">{fecStats.withFecId}</div>
          </div>

          <div className="bg-muted/30 rounded-lg p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              Never Synced
            </div>
            <div className="text-2xl font-bold text-muted-foreground">{fecStats.neverSynced}</div>
          </div>

          <div className="bg-amber-500/10 rounded-lg p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <RotateCcw className="h-4 w-4 text-amber-600" />
              Partial Sync
            </div>
            <div className="text-2xl font-bold text-amber-600">{fecStats.partialSync}</div>
          </div>

          <div className="bg-green-500/10 rounded-lg p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Complete
            </div>
            <div className="text-2xl font-bold text-green-600">{fecStats.complete}</div>
          </div>
        </div>
        </div>
        {/* Voting Records Stats */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Vote className="h-4 w-4" />
              Congressional Voting Records
              {votingStatsCache?.updatedAt && (
                <span className="text-xs text-muted-foreground">
                  (Updated {formatDistanceToNow(new Date(votingStatsCache.updatedAt), { addSuffix: true })})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        refreshStats("voting_records_stats", {
                          onSuccess: () => {
                            setJustRefreshed("voting");
                            setTimeout(() => setJustRefreshed(null), 2000);
                          }
                        });
                      }}
                      disabled={isRefreshingStats}
                    >
                      {justRefreshed === "voting" ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : isRefreshingStats ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Refresh cached voting stats</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {/* Bulk Legislation Sync with confirmation */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isVoteSyncing || isFloorVoteSyncing}
                  >
                    {isVoteSyncing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Syncing ALL...
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4 mr-2" />
                        Sync ALL Legislation
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sync legislation for all legislators?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will fetch sponsored & cosponsored bills for all 540+ federal legislators from Congress.gov.
                      This operation runs in the background and may take 30+ minutes.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => {
                      syncAllVotes.mutate();
                      toast.info('Started bulk legislation sync...', { description: 'Fetching sponsored & cosponsored bills from Congress.gov for all legislators' });
                    }}>
                      Start Bulk Sync
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Bulk Floor Votes Sync with confirmation */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isVoteSyncing || isFloorVoteSyncing}
                  >
                    {isFloorVoteSyncing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Syncing ALL...
                      </>
                    ) : (
                      <>
                        <Vote className="h-4 w-4 mr-2" />
                        Sync ALL Floor Votes
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sync floor votes for all legislators?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will fetch Yea/Nay roll call votes for all 540+ federal legislators from Congress.gov.
                      This operation runs in the background and may take 30+ minutes.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => {
                      syncAllFloorVotes.mutate();
                      toast.info('Started bulk floor votes sync...', { description: 'Fetching roll call votes from Congress.gov for all legislators' });
                    }}>
                      Start Bulk Sync
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Backfill Answers for Visible States */}
              <BackfillAnswersControl />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        toast.info('Syncing Senate LIS IDs...', { description: 'Fetching LIS member IDs from GitHub' });
                        try {
                          const { data, error } = await supabase.functions.invoke('sync-lis-member-ids');
                          if (error) throw error;
                          toast.success(`LIS sync complete: ${data.updated} updated, ${data.alreadySet} already set`);
                          refetchCandidates();
                        } catch (err: any) {
                          console.error('[Admin] LIS sync failed:', err);
                          toast.error('LIS sync failed', { description: err.message });
                        }
                      }}
                      disabled={isVoteSyncing || isFloorVoteSyncing}
                    >
                      <Users className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Sync Senate LIS member IDs (required for floor votes)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Two-column layout for Legislative Actions vs Floor Votes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Legislative Actions Card */}
            <div className="bg-muted/30 rounded-lg p-4 space-y-3 border border-muted">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4 text-blue-600" />
                  Legislative Actions
                </div>
                <Badge variant="outline" className="text-xs">Sponsored / Cosponsored</Badge>
              </div>
              <div className="text-3xl font-bold text-blue-600">
                {votingStats?.legislativeActions?.toLocaleString() || 0}
              </div>
              <div className="text-xs text-muted-foreground">
                Bills and resolutions (co)sponsored by members
              </div>
            </div>

            {/* Floor Votes Card */}
            <div className="bg-muted/30 rounded-lg p-4 space-y-3 border border-muted">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Vote className="h-4 w-4 text-green-600" />
                  Floor Votes
                </div>
                <Badge variant="outline" className="text-xs">Yea / Nay / Present</Badge>
              </div>
              <div className="text-3xl font-bold text-green-600">
                {votingStats?.floorVotes?.toLocaleString() || 0}
              </div>
              <div className="text-xs text-muted-foreground">
                Actual roll call votes cast on the floor
              </div>
            </div>
          </div>

          {/* Coverage Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <FileText className="h-4 w-4" />
                Total Records
              </div>
              <div className="text-2xl font-bold">{votingStats?.totalRecords?.toLocaleString() || 0}</div>
            </div>

            <div className="bg-muted/30 rounded-lg p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Users className="h-4 w-4" />
                Members Synced
              </div>
              <div className="text-2xl font-bold">
                {votingStats?.membersSynced || 0}
                <span className="text-sm text-muted-foreground font-normal"> / 540</span>
              </div>
            </div>

            <div className="bg-purple-500/10 rounded-lg p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Vote className="h-4 w-4 text-purple-600" />
                With Floor Votes
              </div>
              <div className="text-2xl font-bold text-purple-600">
                {votingStats?.membersWithFloorVotes || 0}
              </div>
            </div>

            <div className="bg-green-500/10 rounded-lg p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Coverage
              </div>
              <div className="text-2xl font-bold text-green-600">
                {votingStats?.coveragePercentage || 0}%
              </div>
            </div>
          </div>

          {/* Voting Sync Progress - Legislation */}
          {isVoteSyncing && voteSyncProgress && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <span className="font-medium">Syncing Legislation: {voteSyncProgress.current || 'Starting...'}</span>
                </span>
                <span className="text-muted-foreground">
                  {voteSyncProgress.completed} / {voteSyncProgress.total}
                </span>
              </div>
              <Progress 
                value={(voteSyncProgress.completed / voteSyncProgress.total) * 100} 
                className="h-2" 
              />
              {voteSyncProgress.errors.length > 0 && (
                <p className="text-xs text-destructive">
                  {voteSyncProgress.errors.length} error(s)
                </p>
              )}
            </div>
          )}

          {/* Floor Vote Sync Progress */}
          {isFloorVoteSyncing && floorVoteProgress && (
            <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-green-600" />
                  <span className="font-medium">Syncing Floor Votes: {floorVoteProgress.current || 'Starting...'}</span>
                </span>
                <span className="text-muted-foreground">
                  {floorVoteProgress.completed} / {floorVoteProgress.total}
                </span>
              </div>
              <Progress 
                value={(floorVoteProgress.completed / floorVoteProgress.total) * 100} 
                className="h-2" 
              />
              {floorVoteProgress.errors.length > 0 && (
                <p className="text-xs text-destructive">
                  {floorVoteProgress.errors.length} error(s)
                </p>
              )}
            </div>
          )}
        </div>

        {/* Overall Progress */}
        {syncStats && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Overall Coverage</span>
              <span className="font-medium">
                {syncStats.totalActualAnswers.toLocaleString()} / {syncStats.totalPotentialAnswers.toLocaleString()} answers
              </span>
            </div>
            <Progress value={syncStats.overallCoveragePercent} className="h-3" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className={getCoverageColor(syncStats.overallCoveragePercent)}>
                {syncStats.overallCoveragePercent}% complete
              </span>
              {syncStats.lastSyncTime && (
                <span>
                  Last sync: {formatDistanceToNow(new Date(syncStats.lastSyncTime), { addSuffix: true })}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Unified Batch Progress */}
        {(isBatchRunning || isFECBatchRunning) && (batchProgress || fecBatchProgress) && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {batchProgress?.retrying ? (
                  <AlertTriangle className="h-4 w-4 text-amber-500 animate-pulse" />
                ) : batchProgress?.paused ? (
                  <Pause className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                )}
                <span className="text-sm font-medium">
                  {batchProgress?.paused 
                    ? 'Paused' 
                    : batchProgress?.retrying 
                      ? `Retrying ${batchProgress.currentName} (attempt ${batchProgress.retryCount}/3)` 
                      : isFECBatchRunning 
                        ? `FEC: ${fecBatchProgress?.currentName}`
                        : `Processing: ${batchProgress?.currentName}`}
                </span>
              </div>
              <span className="text-sm text-muted-foreground">
                {batchProgress 
                  ? `${batchProgress.completed} / ${batchProgress.total}`
                  : fecBatchProgress 
                    ? `${fecBatchProgress.current} / ${fecBatchProgress.total}`
                    : ''}
              </span>
            </div>
            <Progress 
              value={
                batchProgress 
                  ? (batchProgress.completed / batchProgress.total) * 100 
                  : fecBatchProgress 
                    ? (fecBatchProgress.current / fecBatchProgress.total) * 100 
                    : 0
              } 
              className="h-2" 
            />
            {isBatchRunning && batchProgress && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  {batchProgress.errors > 0 && (
                    <span className="text-destructive">{batchProgress.errors} error(s)</span>
                  )}
                  {batchProgress.retrying && (
                    <span className="text-amber-600">Worker limit hit - waiting to retry...</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {batchProgress.paused ? (
                    <Button variant="outline" size="sm" onClick={resumeBatch}>
                      <Play className="h-4 w-4 mr-1" />
                      Resume
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={pauseBatch}>
                      <Pause className="h-4 w-4 mr-1" />
                      Pause
                    </Button>
                  )}
                  <Button variant="destructive" size="sm" onClick={cancelBatch}>
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sync All Progress */}
        {syncAllProgress && (
          <div className={cn(
            "border rounded-lg p-4 space-y-3",
            syncAllProgress.isRunning 
              ? "bg-green-500/5 border-green-500/20" 
              : syncAllProgress.errors.length > 0 
                ? "bg-amber-500/5 border-amber-500/20"
                : "bg-green-500/10 border-green-500/30"
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {syncAllProgress.isRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin text-green-600" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                )}
                <span className="text-sm font-medium">
                  {syncAllProgress.isRunning 
                    ? `Syncing: ${syncAllProgress.currentCandidate}`
                    : syncAllProgress.currentCandidate}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>{syncAllProgress.candidatesCompleted} / {syncAllProgress.candidatesTotal} candidates</span>
                <span className="text-green-600 font-medium">
                  {syncAllProgress.totalDonorsImported.toLocaleString()} donors
                </span>
                <span className="text-green-600">
                  ${syncAllProgress.totalRaised.toLocaleString()}
                </span>
              </div>
            </div>
            
            <Progress 
              value={syncAllProgress.candidatesTotal > 0 
                ? (syncAllProgress.candidatesCompleted / syncAllProgress.candidatesTotal) * 100 
                : 0
              } 
              className="h-2" 
            />
            
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {syncAllProgress.isRunning && syncAllProgress.startTime && (
                  <span>
                    Running for {Math.round((Date.now() - syncAllProgress.startTime) / 1000 / 60)} minutes
                  </span>
                )}
                {syncAllProgress.errors.length > 0 && (
                  <span className="text-amber-600 ml-2">
                    {syncAllProgress.errors.length} error(s)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {syncAllProgress.isRunning ? (
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={cancelSyncAll}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Stop Sync
                  </Button>
                ) : (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      clearSyncAllProgress();
                      refetchCandidates();
                    }}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Dismiss
                  </Button>
                )}
              </div>
            </div>
            
            {/* Show errors if any */}
            {syncAllProgress.errors.length > 0 && !syncAllProgress.isRunning && (
              <div className="mt-2 text-xs text-amber-600 max-h-32 overflow-y-auto">
                <div className="font-medium mb-1">Errors encountered:</div>
                {syncAllProgress.errors.slice(0, 10).map((err, i) => (
                  <div key={i} className="truncate">{err}</div>
                ))}
                {syncAllProgress.errors.length > 10 && (
                  <div className="text-muted-foreground">...and {syncAllProgress.errors.length - 10} more</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Per-Candidate Sync Progress with Estimated % */}
        {syncProgress && (
          <div className={cn(
            "border rounded-lg p-4 space-y-2",
            syncProgress.isAutoResuming 
              ? "bg-purple-500/5 border-purple-500/20" 
              : "bg-blue-500/5 border-blue-500/20"
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {syncProgress.isComplete ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                )}
                <span className="text-sm font-medium">
                  {syncProgress.isComplete ? 'Complete' : syncProgress.isAutoResuming ? 'Auto-Resuming' : 'Syncing'}: {syncProgress.candidateName}
                </span>
                {syncProgress.isAutoResuming && (
                  <Badge variant="outline" className="text-xs bg-purple-100 text-purple-700 border-purple-300">
                    Unlimited Mode
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                {syncProgress.attempts && (
                  <span className="text-xs">
                    Attempt {syncProgress.attempts}
                  </span>
                )}
                <span className="text-blue-600 font-medium">
                  {syncProgress.donorsImported.toLocaleString()} donors
                </span>
              </div>
            </div>
            
            {/* Progress bar based on estimated completion */}
            <div className="space-y-1">
              <Progress 
                value={syncProgress.estimatedProgress || (syncProgress.committeesTotal > 0 
                  ? (syncProgress.committeesSynced / syncProgress.committeesTotal) * 100 
                  : 0)
                } 
                className="h-2" 
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {syncProgress.estimatedProgress !== undefined 
                    ? `~${syncProgress.estimatedProgress}% complete`
                    : `Committee ${syncProgress.committeesSynced}/${syncProgress.committeesTotal}`
                  }
                </span>
                {syncProgress.fecItemized && syncProgress.fecItemized > 0 && (
                  <span>
                    {formatCurrency(syncProgress.localItemized)} / {formatCurrency(syncProgress.fecItemized)} itemized
                  </span>
                )}
              </div>
            </div>
            
            {/* Rate limit indicator */}
            {syncProgress.isWaitingForRateLimit && (
              <div className="flex items-center gap-2 text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-md text-xs">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Rate limit reached - waiting {syncProgress.rateLimitWaitSeconds || 15}s before retrying...</span>
              </div>
            )}
            
            <div className="text-xs text-muted-foreground">
              {syncProgress.isAutoResuming 
                ? 'Running until complete. For high-volume candidates this may take 10-30 minutes.'
                : 'Auto-continues until all committees are synced. This may take several minutes for large campaigns.'
              }
            </div>
          </div>
        )}

        {/* Global Background Processing Status */}
        {isBackgroundProcessing && backgroundJobs.length > 0 && (
          <ProcessingStatusIndicator 
            jobs={backgroundJobs}
            onClearJob={removeBackgroundJob}
            onClearAll={clearAllBackgroundJobs}
            onRetryJob={retryBackgroundJob}
          />
        )}

        {/* Search and High-Volume Mode */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* High-Volume Mode Toggle */}
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-md border">
            <Zap className={cn("h-4 w-4", highVolumeMode ? "text-amber-500" : "text-muted-foreground")} />
            <label htmlFor="high-volume-mode" className="text-sm font-medium cursor-pointer">
              High-Volume Mode
            </label>
            <button
              id="high-volume-mode"
              role="switch"
              aria-checked={highVolumeMode}
              onClick={() => setHighVolumeMode(!highVolumeMode)}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                highVolumeMode ? "bg-amber-500" : "bg-muted-foreground/30"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform",
                  highVolumeMode ? "translate-x-4" : "translate-x-0"
                )}
              />
            </button>
            <Popover>
              <PopoverTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground">
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 text-sm">
                <p className="font-medium mb-1">High-Volume Mode</p>
                <p className="text-muted-foreground">
                  Uses smaller batches (25 vs 100 records per call) for faster returns 
                  and smoother progress on massive candidates like Adam Schiff.
                </p>
              </PopoverContent>
            </Popover>
          </div>
          
          {/* Active filters indicator */}
          {(partyFilter !== 'all' || stateFilter !== 'all' || coverageFilter !== 'all' || syncFilter !== 'all' || deltaFilter !== 'all' || financeFilter !== 'all' || scoreFilter !== 'all' || tierFilter !== 'all' || fecIdFilter !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPartyFilter('all');
                setStateFilter('all');
                setCoverageFilter('all');
                setSyncFilter('all');
                setDeltaFilter('all');
                setFinanceFilter('all');
                setScoreFilter('all');
                setTierFilter('all');
                setFecIdFilter('all');
                setLevelFilter('all');
              }}
              className="text-xs h-8"
            >
              <X className="h-3 w-3 mr-1" />
              Clear Filters
            </Button>
          )}
        </div>

        {/* All Filters - Always Visible */}
        <div className="flex flex-wrap gap-x-4 gap-y-2 items-center border-b pb-3 mb-3">
          {/* Row 1: Primary Filters */}
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-muted-foreground">Party:</span>
            <Select value={partyFilter} onValueChange={setPartyFilter}>
              <SelectTrigger className="w-[100px] h-7 text-xs bg-background">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="Democrat">Democrat</SelectItem>
                <SelectItem value="Republican">Republican</SelectItem>
                <SelectItem value="Independent">Independent</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-muted-foreground">State:</span>
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger className="w-[80px] h-7 text-xs bg-background">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All</SelectItem>
                {visibleStates.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-muted-foreground">Coverage:</span>
            <Select value={coverageFilter} onValueChange={(v) => setCoverageFilter(v as typeof coverageFilter)}>
              <SelectTrigger className="w-[100px] h-7 text-xs bg-background">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="none">None (0%)</SelectItem>
                <SelectItem value="low">Low (&lt;50%)</SelectItem>
                <SelectItem value="full">Full (100%)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-muted-foreground">Level:</span>
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className="w-[120px] h-7 text-xs bg-background">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="federal_legislative">Congress</SelectItem>
                <SelectItem value="state_executive">State Exec</SelectItem>
                <SelectItem value="state_legislative">State Leg</SelectItem>
                <SelectItem value="local">Local</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-muted-foreground">Score:</span>
            <Select value={scoreFilter} onValueChange={(v) => setScoreFilter(v as typeof scoreFilter)}>
              <SelectTrigger className="w-[95px] h-7 text-xs bg-background">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="left">Left (&lt;-3)</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="right">Right (&gt;3)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-muted-foreground">Tier:</span>
            <Select value={tierFilter} onValueChange={(v) => setTierFilter(v as typeof tierFilter)}>
              <SelectTrigger className="w-[80px] h-7 text-xs bg-background">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="T1">Tier 1</SelectItem>
                <SelectItem value="T2">Tier 2</SelectItem>
                <SelectItem value="T3">Tier 3</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-muted-foreground">Sync:</span>
            <Select value={syncFilter} onValueChange={(v) => setSyncFilter(v as typeof syncFilter)}>
              <SelectTrigger className="w-[110px] h-7 text-xs bg-background">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="no_committee">No Committee</SelectItem>
                <SelectItem value="needs_sync">Needs Sync</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
                <SelectItem value="fec_mismatch">FEC Mismatch</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-muted-foreground">Finance:</span>
            <Select value={financeFilter} onValueChange={(v) => setFinanceFilter(v as typeof financeFilter)}>
              <SelectTrigger className="w-[100px] h-7 text-xs bg-background">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="mismatch">FEC Mismatch</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-muted-foreground">Delta:</span>
            <Select value={deltaFilter} onValueChange={(v) => setDeltaFilter(v as typeof deltaFilter)}>
              <SelectTrigger className="w-[100px] h-7 text-xs bg-background">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="within">Within ±2%</SelectItem>
                <SelectItem value="minor">Minor (2-5%)</SelectItem>
                <SelectItem value="major">Major (&gt;5%)</SelectItem>
                <SelectItem value="no_data">No Data</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-muted-foreground">FEC ID:</span>
            <Select value={fecIdFilter} onValueChange={(v) => setFecIdFilter(v as typeof fecIdFilter)}>
              <SelectTrigger className="w-[90px] h-7 text-xs bg-background">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="has_id">Has ID</SelectItem>
                <SelectItem value="missing">Missing</SelectItem>
                <SelectItem value="mismatch">Mismatch</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-muted-foreground">Cycle:</span>
            <Select value={financeCycle} onValueChange={setFinanceCycle}>
              <SelectTrigger className="w-[90px] h-7 text-xs bg-background">
                <SelectValue placeholder="Cycle" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {(availableCycles ?? [financeCycle]).map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Candidates Table */}
        {!hasSelectedFilters ? (
          <div className="text-center py-12 border rounded-md">
            <Search className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-lg font-medium text-muted-foreground">
              Use the filters above to load candidates
            </p>
          </div>
        ) : candidatesLoading && !candidates ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : paginatedCandidates.length > 0 ? (
          <div className="rounded-md border overflow-x-auto relative">
            {isTableRefetching && (
              <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="px-2 py-2 max-w-[140px]">Name</TableHead>
                  <TableHead className="w-[50px] px-2 py-2">Party</TableHead>
                  <TableHead className="w-[55px] px-2 py-2">State</TableHead>
                  <TableHead className="text-center w-[70px] px-2 py-2">Answers</TableHead>
                  <TableHead className="w-[55px] px-2 py-2">Score</TableHead>
                  <TableHead className="w-[52px] px-2 py-2">Tier</TableHead>
                  <TableHead className="w-[44px] px-2 py-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="cursor-help">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>Legislative Actions (Sponsored/Cosponsored)</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                  <TableHead className="w-[44px] px-2 py-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="cursor-help">
                          <Vote className="h-3.5 w-3.5 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>Floor Votes (Yea/Nay/Present)</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                  <TableHead className="w-[44px] px-2 py-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="cursor-help">
                          <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>Health Status</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                  <TableHead className="w-[44px] px-2 py-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="cursor-help">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>Committee Status</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                  <TableHead className="w-[65px] px-2 py-2">Sync</TableHead>
                  <TableHead className="w-[55px] px-2 py-2">
                    <DollarSign className="h-3.5 w-3.5" />
                  </TableHead>
                  <TableHead className="w-[72px] px-2 py-2 text-right">FEC</TableHead>
                  <TableHead className="w-[72px] px-2 py-2 text-right">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1 cursor-help justify-end">
                          Local
                          <HelpCircle className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[280px]">
                          <p className="font-medium mb-1">Local + Non-Itemized Receipts</p>
                          <p className="text-xs text-muted-foreground">
                            Imported itemized contributions + FEC-reported unitemized + other receipts 
                            (loans, transfers, candidate contributions). 
                            This provides an apples-to-apples comparison with FEC Total.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                  <TableHead className="w-[65px] px-2 py-2">Delta</TableHead>
                  <TableHead className="w-[75px] px-2 py-2">FEC ID</TableHead>
                  <TableHead className="text-right w-[40px] px-2 py-2"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                    {paginatedCandidates.map((candidate) => {
                      const loading = isLoading(candidate.id);
                      const fecLoading = isFECLoading(candidate.id);
                      const donorLoading = isDonorLoading(candidate.id);
                      const isComplete = candidate.percentage >= 100;
                      const hasFecId = !!candidate.fecCandidateId;
                      const hasCommittee = !!candidate.fecCommitteeId;
                      const financeStatus = calculateFinanceStatus(candidate);
                      // Calculate "Local Total" = Local Itemized + Local Other Receipts + FEC-only summary items
                      // This creates an apples-to-apples comparison with FEC Total Receipts
                      const localItemized = candidate.localItemized || 0; // Itemized contributions (Line 11)
                      const localTransfers = candidate.localTransfers || 0; // Committee transfers (Line 12)
                      const localOtherReceipts = candidate.localOtherReceipts || 0; // Local Line 14 + 15
                      const localLoans = candidate.localLoans || 0; // Local loans (Line 13)
                      const fecUnitemized = candidate.fecUnitemized || 0;
                      const fecCandidateContribution = candidate.fecCandidateContribution || 0;
                      const fecOtherReceipts = candidate.fecOtherReceipts || 0; // Line 15 only
                      const fecOffsetsToOperatingExpenditures = candidate.fecOffsetsToOperatingExpenditures || 0; // Line 14
                      const fecLoans = candidate.fecLoans || 0;
                      const fecTransfers = candidate.fecTransfers || 0;
                      
                      // FEC "Other" = Line 14 (offsets) + Line 15 (other receipts)
                      const fecOtherTotal = fecOffsetsToOperatingExpenditures + fecOtherReceipts;
                      
                      // Use Math.max for Transfers/Loans/Other to fill gaps when local data is incomplete
                      // This handles cases where parent aggregate records are missing from local imports
                      const effectiveTransfers = Math.max(localTransfers, fecTransfers);
                      const effectiveLoans = Math.max(localLoans, fecLoans);
                      const effectiveOther = Math.max(localOtherReceipts, fecOtherTotal);
                      
                      // Local Total = Local Itemized + Effective Transfers/Loans/Other + FEC-only items
                      // Only Unitemized and Candidate Self-Fund are FEC-only (we can't import those)
                      const localTotal = localItemized + effectiveTransfers + effectiveLoans + effectiveOther + fecUnitemized + fecCandidateContribution;
                      
                      // Calculate delta inline: Local Total vs FEC Total Receipts
                      const fecTotalReceipts = financeStatus.fecTotalReceipts;
                      const calculatedDelta = fecTotalReceipts !== null && fecTotalReceipts !== undefined
                        ? localTotal - fecTotalReceipts
                        : null;
                      const calculatedDeltaPct = fecTotalReceipts && fecTotalReceipts > 0 
                        ? (calculatedDelta! / fecTotalReceipts) * 100 
                        : null;
                      
                      const syncStatus = candidate.syncStatus;
                      const hasOverride = overrideMap.has(candidate.id);
                      
                      // Use database-calculated delta (apples-to-apples: itemized vs itemized)
                      const getFinanceBadgeStatus = (): 'ok' | 'warning' | 'error' | null => {
                        if (!financeStatus.hasData) return null;
                        // Use reconciliation status from DB if available
                        if (candidate.reconciliationStatus) {
                          return candidate.reconciliationStatus as 'ok' | 'warning' | 'error';
                        }
                        // Fallback to calculating from DB deltaPct
                        if (candidate.deltaPct === null || candidate.deltaPct === undefined) return null;
                        const absPct = Math.abs(candidate.deltaPct);
                        if (absPct <= 2) return 'ok';
                        if (absPct <= 5) return 'warning';
                        return 'error';
                      };

                      return (
                        <TableRow key={candidate.id}>
                          <TableCell className="font-medium px-2 py-2 max-w-[140px]">
                            <Link
                              to={`/candidate/${candidate.id}`}
                              className="hover:underline text-primary flex items-center gap-1 truncate"
                            >
                              <span className="truncate">{candidate.name}</span>
                              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                            </Link>
                          </TableCell>
                          <TableCell className="px-2 py-2">
                            <Badge className={cn(getPartyBadgeColor(candidate.party), "text-[10px] px-1.5 py-0")}>
                              {getPartyBadge(candidate.party)}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-2 py-2">{candidate.state}</TableCell>
                          <TableCell className="text-center px-2 py-2">
                            <button 
                              className="hover:opacity-80 transition-opacity cursor-pointer"
                              onClick={() => setAnswerDialogCandidate({ id: candidate.id, name: candidate.name })}
                            >
                              {isComplete ? (
                                <div className="flex items-center justify-center gap-1">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
                                  <span className={`w-2 h-2 rounded-full ${getSourceDotColor(candidate.sourcePercentage)}`} />
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1 text-xs">
                                  <span className={candidate.answerCount === 0 ? 'text-amber-600' : 'text-foreground'}>
                                    {candidate.answerCount}/{candidate.totalQuestions}
                                  </span>
                                  {candidate.answerCount > 0 && (
                                    <span className={`w-2 h-2 rounded-full ${getSourceDotColor(candidate.sourcePercentage)}`} />
                                  )}
                                </div>
                              )}
                            </button>
                          </TableCell>
                          <TableCell className="px-2 py-2">
                            {candidate.overallScore !== null && candidate.overallScore !== undefined ? (
                              <span className="font-mono text-xs">
                                <ScoreTextInline score={candidate.overallScore} />
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="px-2 py-2">
                            <CoverageTierBadge tier={candidate.coverageTier} showTooltip={false} compact />
                          </TableCell>
                          {/* Legislative Actions Column */}
                          <TableCell className="text-center px-2 py-2">
                            {candidate.id.match(/^[A-Z][0-9]{6}$/) ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge 
                                      variant="outline" 
                                      className={cn(
                                        "text-[10px] px-1.5 py-0 cursor-default",
                                        candidate.voteSyncStatus === 'complete' 
                                          ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800" 
                                          : candidate.voteSyncStatus === 'partial'
                                            ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
                                            : candidate.voteSyncStatus === 'error'
                                              ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800"
                                              : candidate.legislativeActionsCount > 0 
                                                ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800" 
                                                : ""
                                      )}
                                    >
                                      {candidate.legislativeActionsCount || 0}
                                      {candidate.expectedVoteCount !== null && (
                                        <span className="text-muted-foreground">/{candidate.expectedVoteCount}</span>
                                      )}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs">
                                    <p className="text-sm font-medium">Legislative Actions</p>
                                    <p className="text-xs text-muted-foreground">
                                      {candidate.expectedVoteCount !== null 
                                        ? `${candidate.legislativeActionsCount} of ${candidate.expectedVoteCount} sponsored/cosponsored bills synced`
                                        : 'Never synced'}
                                    </p>
                                    {candidate.lastVoteSyncAt && (
                                      <p className="text-xs text-muted-foreground mt-1">
                                        Last sync: {formatDistanceToNow(new Date(candidate.lastVoteSyncAt), { addSuffix: true })}
                                      </p>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <span className="text-muted-foreground text-[10px]">—</span>
                            )}
                          </TableCell>
                          {/* Floor Votes Column */}
                          <TableCell className="text-center px-2 py-2">
                            {candidate.id.match(/^[A-Z][0-9]{6}$/) ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge 
                                      variant="outline" 
                                      className={cn(
                                        "text-[10px] px-1.5 py-0 cursor-default",
                                        candidate.floorVoteSyncStatus === 'complete' 
                                          ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800" 
                                          : candidate.floorVoteSyncStatus === 'partial'
                                            ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
                                            : candidate.floorVoteSyncStatus === 'error'
                                              ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800"
                                              : candidate.floorVotesCount > 0 
                                                ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800" 
                                                : ""
                                      )}
                                    >
                                      {candidate.floorVotesCount || 0}
                                      {candidate.expectedFloorVotes !== null && (
                                        <span className="text-muted-foreground">/{candidate.expectedFloorVotes}</span>
                                      )}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs">
                                    <p className="text-sm font-medium">Floor Votes</p>
                                    <p className="text-xs text-muted-foreground">
                                      {candidate.expectedFloorVotes !== null 
                                        ? `${candidate.floorVotesCount} of ${candidate.expectedFloorVotes} roll-call votes synced`
                                        : 'Never synced'}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <span className="text-muted-foreground text-[10px]">—</span>
                            )}
                          </TableCell>
                          <TableCell className="px-2 py-2">
                            <CandidateHealthBadge
                              hasFecId={hasFecId}
                              hasCommittee={hasCommittee}
                              syncStatus={syncStatus}
                              financeStatus={getFinanceBadgeStatus() || 'none'}
                              hasOverride={hasOverride}
                            />
                          </TableCell>
                          <TableCell className="px-2 py-2">
                            <Popover>
                              <PopoverTrigger asChild>
                                <div className="cursor-pointer">
                                  <CommitteeLinkStatusBadge
                                    candidateId={candidate.id}
                                    candidateName={candidate.name}
                                    fecCandidateId={candidate.fecCandidateId}
                                    fecCommitteeId={candidate.fecCommitteeId}
                                    committeeCount={candidate.committeeCount}
                                    lastSyncDate={candidate.lastSyncDate}
                                    onLinkCommittees={fetchFECCommittees}
                                    onRefetch={refetchCandidates}
                                    disabled={anyBatchRunning}
                                  />
                                </div>
                              </PopoverTrigger>
                              {hasCommittee && (
                                <PopoverContent className="w-96 p-0" align="start">
                                  <div className="p-3 border-b">
                                    <h4 className="font-medium text-sm">Committee Management</h4>
                                    <p className="text-xs text-muted-foreground">
                                      Toggle which committees to include in donor sync
                                    </p>
                                  </div>
                                  <div className="p-3">
                                    <CommitteeBreakdown
                                      candidateId={candidate.id}
                                      candidateName={candidate.name}
                                      fecCandidateId={candidate.fecCandidateId!}
                                      onRefetch={refetchCandidates}
                                    />
                                  </div>
                                </PopoverContent>
                              )}
                            </Popover>
                          </TableCell>
                          <TableCell className="px-2 py-2">
                            <SyncStatusBadge
                              status={syncStatus}
                              lastSyncDate={candidate.lastDonorSync}
                              reconciliationCheckedAt={candidate.reconciliationCheckedAt}
                              hasFecId={hasFecId}
                              compact
                            />
                          </TableCell>
                          <TableCell className="px-2 py-2">
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="hover:opacity-80 transition-opacity">
                                <FinanceStatusBadge
                                  status={getFinanceBadgeStatus()}
                                  deltaPct={candidate.deltaPct}
                                  deltaAmount={candidate.deltaAmount}
                                  fecTotalReceipts={financeStatus.fecTotalReceipts}
                                  localItemized={localItemized}
                                  reconciliationCheckedAt={candidate.reconciliationCheckedAt}
                                />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-72 p-3" align="start">
                                <FinanceSummaryCard
                                  data={{
                                    fecItemized: financeStatus.fecItemized,
                                    fecUnitemized: financeStatus.fecUnitemized,
                                    fecTotalReceipts: financeStatus.fecTotalReceipts,
                                  }}
                                  compact
                                />
                              </PopoverContent>
                            </Popover>
                          </TableCell>
                          <TableCell className="text-right px-2 py-2 whitespace-nowrap">
                            <span className="font-medium text-xs">{formatCurrency(financeStatus.fecTotalReceipts, true)}</span>
                          </TableCell>
                          <TableCell className="text-right px-2 py-2 whitespace-nowrap">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="font-medium text-xs hover:underline cursor-help">
                                  {formatCurrency(localTotal, true)}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-96 p-3" align="end">
                                <FinanceCategoryBreakdown
                                  localIndividualItemized={candidate.localIndividualItemized}
                                  localGrossIndividual={candidate.localGrossIndividual}
                                  localOrganization={candidate.localOrganization}
                                  memoXAmount={candidate.memoXAmount}
                                  localPacContributions={candidate.localPacContributions}
                                  localPartyContributions={candidate.localPartyContributions}
                                  fecItemized={candidate.fecItemized}
                                  fecPacContributions={candidate.fecPacContributions}
                                  fecPartyContributions={candidate.fecPartyContributions}
                                  individualDeltaPct={candidate.individualDeltaPct}
                                  pacDeltaPct={candidate.pacDeltaPct}
                                />
                                
                                {/* Additional Receipts - Local vs FEC comparison */}
                                <div className="border-t mt-3 pt-3 space-y-1.5 text-xs">
                                  <div className="font-medium text-muted-foreground mb-2">Additional Receipts</div>
                                  
                                  {/* FEC-only item: Unitemized */}
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Unitemized (&lt;$200)</span>
                                    <span className="text-muted-foreground italic">{formatCurrency(fecUnitemized)} FEC</span>
                                  </div>
                                  
                                  {/* Local vs FEC: Transfers (Line 12) */}
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Transfers (Line 12)</span>
                                    <span className="flex gap-2">
                                      <span>{formatCurrency(localTransfers)}</span>
                                      <span className="text-muted-foreground">/ {formatCurrency(fecTransfers)} FEC</span>
                                    </span>
                                  </div>
                                  
                                  {/* Local vs FEC: Loans (Line 13) */}
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Loans (Line 13)</span>
                                    <span className="flex gap-2">
                                      <span>{formatCurrency(candidate.localLoans || 0)}</span>
                                      <span className="text-muted-foreground">/ {formatCurrency(fecLoans)} FEC</span>
                                    </span>
                                  </div>
                                  
                                  {/* Local vs FEC: Other (Lines 14+15) */}
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Other (Lines 14+15)</span>
                                    <span className="flex gap-2">
                                      <span>{formatCurrency(localOtherReceipts)}</span>
                                      <span className="text-muted-foreground">/ {formatCurrency(fecOtherTotal)} FEC</span>
                                    </span>
                                  </div>
                                  
                                  {/* FEC-only item: Candidate Self-Fund */}
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Candidate Self-Fund</span>
                                    <span className="text-muted-foreground italic">{formatCurrency(fecCandidateContribution)} FEC</span>
                                  </div>
                                  
                                  <div className="flex justify-between border-t pt-1.5 mt-1.5">
                                    <span className="font-medium">FEC Total Receipts</span>
                                    <span className="font-bold">{formatCurrency(fecTotalReceipts)}</span>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">
                            <DeltaBadge
                              deltaAmount={candidate.totalReceiptsDeltaAmount ?? calculatedDelta}
                              deltaPct={candidate.totalReceiptsDeltaPct ?? calculatedDeltaPct}
                              itemizedDeltaAmount={candidate.deltaAmount}
                              itemizedDeltaPct={candidate.deltaPct}
                              individualDeltaPct={candidate.individualDeltaPct}
                              pacDeltaPct={candidate.pacDeltaPct}
                            />
                          </TableCell>
                          <TableCell className="px-2 py-2">
                            {hasFecId ? (
                              <div 
                                className="flex items-center gap-0.5 cursor-pointer group"
                                onClick={() => {
                                  setEditDialogTab('fec');
                                  setEditingCandidate(candidate);
                                }}
                                title="Click to manage FEC IDs"
                              >
                                {candidate.fecIdMismatch && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                                      </TooltipTrigger>
                                      <TooltipContent side="left" className="max-w-[260px]">
                                        <p className="font-medium text-amber-600 mb-1">FEC ID Mismatch</p>
                                        <p className="text-xs text-muted-foreground">
                                          {candidate.fecIdMismatchReason || 'FEC ID prefix does not match current office'}
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                                <Badge 
                                  variant="outline" 
                                  className={cn(
                                    "text-[10px] font-mono px-1 py-0 group-hover:border-primary/50 group-hover:bg-primary/5 transition-colors",
                                    candidate.fecIdMismatch && "border-amber-500/50 text-amber-600"
                                  )}
                                >
                                  {candidate.fecCandidateId?.slice(0, 7)}
                                </Badge>
                              </div>
                            ) : (
                              <span className="text-muted-foreground/50 text-[10px]">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right px-2 py-2">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0"
                                  disabled={anyBatchRunning || loading || fecLoading || donorLoading}
                                >
                                  {(loading || fecLoading || donorLoading) ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                {/* FEC ID Actions */}
                                {!hasFecId && (
                                  <>
                                    <DropdownMenuItem
                                      onSelect={(e) => {
                                        e.preventDefault();
                                        void (async () => {
                                          try {
                                            const result = await fetchFECCandidateId(
                                              candidate.id,
                                              candidate.name,
                                              candidate.state,
                                              true
                                            );
                                            if (result.found && result.updated) {
                                              toast.success(`Linked: ${result.fecCandidateId}`);
                                              refetchCandidates();
                                            } else if (result.found) {
                                              toast.info(`Found ${result.candidates?.length} matches`);
                                            } else {
                                              toast.error(result.error || 'No FEC candidate found');
                                            }
                                          } catch (err) {
                                            console.error('[Admin] Link FEC ID failed:', err);
                                            toast.error('Failed to link FEC ID');
                                          }
                                        })();
                                      }}
                                    >
                                      <Link2 className="h-4 w-4 mr-2" />
                                      Link FEC ID
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                  </>
                                )}
                                
                                {/* Donor Sync Actions */}
                                {hasFecId && hasCommittee && (
                                  <>
                                    {syncStatus === 'never' && (
                                      <DropdownMenuItem
                                        onSelect={(e) => {
                                          e.preventDefault();
                                          void (async () => {
                                            try {
                                              toast.info(`Starting donor sync for ${candidate.name}...`);
                                              const result = await fetchFECDonorsComplete(
                                                candidate.id,
                                                candidate.fecCandidateId!,
                                                candidate.name,
                                                financeCycle,
                                                false
                                              );
                                              if (result.success) {
                                                if (result.hasMore) {
                                                  toast.info(`Partial sync: ${result.imported} donors. Resume to continue.`);
                                                } else {
                                                  toast.success(`Complete: ${result.imported} donors ($${(result.totalRaised || 0).toLocaleString()})`);
                                                }
                                                refetchCandidates();
                                              } else {
                                                toast.error(result.error || 'Failed');
                                              }
                                            } catch (err) {
                                              console.error('[Admin] Fetch donors failed:', err);
                                              toast.error('Failed to fetch donors');
                                            }
                                          })();
                                        }}
                                      >
                                        <DollarSign className="h-4 w-4 mr-2" />
                                        Fetch Donors
                                      </DropdownMenuItem>
                                    )}
                                    {syncStatus === 'partial' && (
                                      <>
                                        <DropdownMenuItem
                                          onSelect={(e) => {
                                            e.preventDefault();
                                            void (async () => {
                                              try {
                                                toast.info(`Resuming donor sync for ${candidate.name}...`);
                                                const result = await fetchFECDonorsComplete(
                                                  candidate.id,
                                                  candidate.fecCandidateId!,
                                                  candidate.name,
                                                  financeCycle,
                                                  false
                                                );
                                                if (result.success) {
                                                  if (result.hasMore) {
                                                    toast.info(`Partial: ${result.imported} donors. Resume to continue.`);
                                                  } else {
                                                    toast.success(`Complete: ${result.imported} donors`);
                                                  }
                                                  refetchCandidates();
                                                } else {
                                                  toast.error(result.error || 'Failed');
                                                }
                                              } catch (err) {
                                                console.error('[Admin] Resume failed:', err);
                                                toast.error('Failed to resume');
                                              }
                                            })();
                                          }}
                                        >
                                          <RotateCcw className="h-4 w-4 mr-2 text-amber-600" />
                                          Resume (1 batch)
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onSelect={(e) => {
                                            e.preventDefault();
                                            void (async () => {
                                              try {
                                                const result = await autoResumeSingleCandidate(
                                                  candidate.id,
                                                  candidate.fecCandidateId!,
                                                  candidate.name,
                                                  financeCycle
                                                );
                                                if (result.success) {
                                                  if (result.hasMore) {
                                                    toast.warning(`Still incomplete. ${result.imported} donors imported.`);
                                                  } else {
                                                    toast.success(`Complete: ${result.imported} donors`);
                                                  }
                                                  refetchCandidates();
                                                } else {
                                                  toast.error(result.error || 'Failed');
                                                }
                                              } catch (err) {
                                                console.error('[Admin] Auto-resume failed:', err);
                                                toast.error('Auto-resume failed');
                                              }
                                            })();
                                          }}
                                        >
                                          <Sparkles className="h-4 w-4 mr-2 text-purple-600" />
                                          Auto-Complete
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                    {/* Sync New Data - when complete but delta is negative (local < FEC) */}
                                    {syncStatus === 'complete' && (candidate.deltaPct ?? 0) < -2 && (
                                      <DropdownMenuItem
                                        onSelect={(e) => {
                                          e.preventDefault();
                                          void (async () => {
                                            try {
                                              toast.info(`Syncing new contributions for ${candidate.name}...`);
                                              const result = await fetchFECDonorsComplete(
                                                candidate.id,
                                                candidate.fecCandidateId!,
                                                candidate.name,
                                                financeCycle,
                                                false
                                              );
                                              if (result.success) {
                                                toast.success(`Synced: ${result.imported} new records`);
                                                refetchCandidates();
                                              } else {
                                                toast.error(result.error || 'Failed');
                                              }
                                            } catch (err) {
                                              console.error('[Admin] Sync new data failed:', err);
                                              toast.error('Failed to sync new data');
                                            }
                                          })();
                                        }}
                                      >
                                        <Download className="h-4 w-4 mr-2 text-blue-600" />
                                        Sync New Data
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                      onSelect={(e) => {
                                        e.preventDefault();
                                        void (async () => {
                                          try {
                                            const result = await forceResyncDonors(
                                              candidate.id,
                                              candidate.fecCandidateId!,
                                              candidate.name,
                                              financeCycle
                                            );
                                            if (result.success) {
                                              toast.success(`Re-sync started: ${result.imported} donors`);
                                              refetchCandidates();
                                            } else {
                                              toast.error(result.error || 'Failed');
                                            }
                                          } catch (err) {
                                            console.error('[Admin] Force re-sync failed:', err);
                                            toast.error('Force re-sync failed');
                                          }
                                        })();
                                      }}
                                      className="text-destructive"
                                    >
                                      <RefreshCw className="h-4 w-4 mr-2" />
                                      {(() => {
                                        const finStatus = getFinanceBadgeStatus();
                                        if (finStatus === 'error' || finStatus === 'warning') {
                                          return 'Clear & Re-Import All';
                                        }
                                        return 'Force Re-Sync';
                                      })()}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                  </>
                                )}
                                
                                {/* FEC Totals & Finance */}
                                {hasFecId && hasCommittee && (
                                  <DropdownMenuItem
                                    onSelect={(e) => {
                                      e.preventDefault();
                                      void (async () => {
                                        try {
                                          toast.info(`Refreshing FEC totals...`);
                                          const result = await refreshFECTotals(candidate.id, financeCycle);
                                          if (result.success) {
                                            toast.success(`FEC totals updated`);
                                            refetchCandidates();
                                          } else {
                                            toast.error(result.error || 'Failed');
                                          }
                                        } catch (err) {
                                          console.error('[Admin] Refresh totals failed:', err);
                                          toast.error('Failed to refresh');
                                        }
                                      })();
                                    }}
                                  >
                                    <BarChart3 className="h-4 w-4 mr-2 text-blue-600" />
                                    Refresh FEC Totals
                                  </DropdownMenuItem>
                                )}
                                {hasFecId && (
                                  <DropdownMenuItem
                                    onSelect={(e) => {
                                      e.preventDefault();
                                      void (async () => {
                                        try {
                                          const result = await triggerReconciliation(candidate.id, financeCycle);
                                          if (result.success) {
                                            toast.success(`Finance refreshed: ${result.status}`);
                                            refetchCandidates();
                                          } else {
                                            toast.error(result.error || 'Failed');
                                          }
                                        } catch (err) {
                                          console.error('[Admin] Reconciliation failed:', err);
                                          toast.error('Failed to refresh');
                                        }
                                      })();
                                    }}
                                  >
                                    <Calculator className="h-4 w-4 mr-2" />
                                    Refresh Finance
                                  </DropdownMenuItem>
                                )}
                                
                                <DropdownMenuSeparator />
                                
                                {/* Voting Records Actions - only for federal legislators */}
                                {candidate.id.match(/^[A-Z][0-9]{6}$/) && (
                                  <>
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <DropdownMenuItem
                                            onSelect={(e) => {
                                              e.preventDefault();
                                              if (isVoteSyncing || isFloorVoteSyncing) return;
                                              void (async () => {
                                                try {
                                                  toast.info(`Syncing legislation for ${candidate.name}...`);
                                                  await syncSingleMember.mutateAsync(candidate.id);
                                                  toast.success(`Synced legislation for ${candidate.name}`);
                                                  refetchCandidates();
                                                } catch (err) {
                                                  console.error('[Admin] Sync votes failed:', err);
                                                  toast.error('Failed to sync legislation');
                                                }
                                              })();
                                            }}
                                            disabled={syncSingleMember.isPending || syncSingleMemberFloorVotes.isPending || isVoteSyncing || isFloorVoteSyncing}
                                          >
                                            <FileText className="h-4 w-4 mr-2" />
                                            Sync This Rep's Legislation
                                            {candidate.voteCount > 0 && (
                                              <span className="ml-auto text-xs text-muted-foreground">
                                                ({candidate.voteCount})
                                              </span>
                                            )}
                                          </DropdownMenuItem>
                                        </TooltipTrigger>
                                        {(isVoteSyncing || isFloorVoteSyncing) && (
                                          <TooltipContent>
                                            <p>Disabled while bulk sync is running</p>
                                          </TooltipContent>
                                        )}
                                      </Tooltip>
                                    </TooltipProvider>
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <DropdownMenuItem
                                            onSelect={(e) => {
                                              e.preventDefault();
                                              if (isVoteSyncing || isFloorVoteSyncing) return;
                                              void (async () => {
                                                try {
                                                  toast.info(`Syncing floor votes for ${candidate.name}...`);
                                                  await syncSingleMemberFloorVotes.mutateAsync({ 
                                                    bioguideId: candidate.id, 
                                                    office: candidate.office || '' 
                                                  });
                                                  toast.success(`Synced floor votes for ${candidate.name}`);
                                                  refetchCandidates();
                                                } catch (err) {
                                                  console.error('[Admin] Sync floor votes failed:', err);
                                                  toast.error('Failed to sync floor votes');
                                                }
                                              })();
                                            }}
                                            disabled={syncSingleMember.isPending || syncSingleMemberFloorVotes.isPending || isVoteSyncing || isFloorVoteSyncing}
                                          >
                                            <Vote className="h-4 w-4 mr-2" />
                                            Sync This Rep's Floor Votes
                                          </DropdownMenuItem>
                                        </TooltipTrigger>
                                        {(isVoteSyncing || isFloorVoteSyncing) && (
                                          <TooltipContent>
                                            <p>Disabled while bulk sync is running</p>
                                          </TooltipContent>
                                        )}
                                      </Tooltip>
                                    </TooltipProvider>
                                  </>
                                )}
                                
                                {/* AI Actions */}
                                {candidate.source === 'civic' && (
                                  <DropdownMenuItem
                                    onSelect={(e) => {
                                      e.preventDefault();
                                      handleCivicResearch(candidate.id, candidate.name);
                                    }}
                                    disabled={civicResearchingIds.has(candidate.id)}
                                  >
                                    {civicResearchingIds.has(candidate.id) ? (
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                      <Brain className="h-4 w-4 mr-2 text-purple-500" />
                                    )}
                                    AI Research (Civic)
                                  </DropdownMenuItem>
                                )}
                                {candidate.answerCount < candidate.totalQuestions && (
                                  <DropdownMenuItem
                                    onSelect={(e) => {
                                      e.preventDefault();
                                      populateCandidate(candidate.id, false);
                                    }}
                                  >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Generate AI Answers
                                  </DropdownMenuItem>
                                )}
                                {candidate.answerCount > 0 && (
                                  <>
                                    <DropdownMenuItem
                                      onSelect={(e) => {
                                        e.preventDefault();
                                        populateCandidate(candidate.id, true);
                                      }}
                                    >
                                      <Sparkles className="h-4 w-4 mr-2" />
                                      Regenerate Answers
                                    </DropdownMenuItem>
                                    {candidate.sourcePercentage < 70 && (
                                      <DropdownMenuItem
                                        onSelect={(e) => {
                                          e.preventDefault();
                                          enrichSources({ candidateId: candidate.id });
                                        }}
                                      >
                                        <Link2 className="h-4 w-4 mr-2 text-blue-500" />
                                        Fill Sources ({candidate.sourcedCount}/{candidate.answerCount})
                                      </DropdownMenuItem>
                                    )}
                                  </>
                                )}
                                
                                <DropdownMenuSeparator />
                                
                                {/* Edit */}
                                <DropdownMenuItem
                                  onSelect={(e) => {
                                    e.preventDefault();
                                    setEditDialogTab('details');
                                    setEditingCandidate(candidate);
                                  }}
                                >
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit Candidate
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                
                {/* Progressive loading indicator */}
                {isLoadingMore && (
                  <div className="flex items-center justify-center gap-2 py-3 bg-muted/30 border-t text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading more candidates...
                  </div>
                )}
                
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between p-4 border-t">
                    <span className="text-sm text-muted-foreground">
                      Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, filteredCandidates.length)} of {filteredCandidates.length}
                    </span>
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious 
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                          />
                        </PaginationItem>
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                        <PaginationItem>
                          <PaginationNext 
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                          />
                        </PaginationItem>
                        <PaginationItem>
                          <PaginationLink
                            onClick={() => setCurrentPage(totalPages)}
                            className={currentPage === totalPages ? 'pointer-events-none opacity-50 cursor-default' : 'cursor-pointer'}
                            aria-label="Go to last page"
                          >
                            <ChevronsRight className="h-4 w-4" />
                            <span className="sr-only">Last page</span>
                          </PaginationLink>
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
                {paginatedCandidates.length === 0 && filteredCandidates.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No candidates match the current filters.
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12">
                <Search className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-lg font-medium">
                  {searchQuery ? 'No matches found' : 'No candidates match filters'}
                </p>
                <p className="text-muted-foreground">
                  {searchQuery
                    ? `No candidates matching "${searchQuery}"`
                    : 'Try adjusting your filter criteria.'}
                </p>
              </div>
            )}
      </CardContent>

      {/* Candidate Edit Dialog */}
      {editingCandidate && (
        <CandidateEditDialog
          open={!!editingCandidate}
          onOpenChange={(open) => {
            if (!open) setEditingCandidate(null);
          }}
          candidateId={editingCandidate.id}
          candidateName={editingCandidate.name}
          currentData={{
            name: editingCandidate.name,
            party: editingCandidate.party,
            office: editingCandidate.office || '',
            state: editingCandidate.state,
            district: null,
            image_url: null,
            overall_score: null,
            coverage_tier: editingCandidate.coverageTier || 'tier_3',
            confidence: editingCandidate.confidence || 'low',
          }}
          defaultTab={editDialogTab}
        />
      )}

      {/* Candidate Answers Dialog */}
      {answerDialogCandidate && (
        <CandidateAnswersDialog
          open={!!answerDialogCandidate}
          onOpenChange={(open) => {
            if (!open) setAnswerDialogCandidate(null);
          }}
          candidateId={answerDialogCandidate.id}
          candidateName={answerDialogCandidate.name}
        />
      )}
    </Card>
  );
}
