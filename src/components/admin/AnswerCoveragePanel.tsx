import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSyncStats, TopicCoverage } from "@/hooks/useSyncStats";
import { useCandidatesAnswerCoverage, useCandidateAnswerStats, useUniqueStates, useRecalculateCoverageTiers, CandidateAnswerCoverage } from "@/hooks/useCandidatesAnswerCoverage";
import { usePopulateCandidateAnswers } from "@/hooks/usePopulateCandidateAnswers";
import { useFECIntegration } from "@/hooks/useFECIntegration";
import { useAdminErrors } from "@/hooks/useAdminErrors";
import { useCandidateOverrides } from "@/hooks/useCandidateOverrides";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, RefreshCw, BarChart3, Users, FileText, HelpCircle, Search, Plus, ExternalLink, CheckCircle2, Pause, Play, X, AlertTriangle, Calculator, Vote, DollarSign, Link2, RotateCcw, ChevronDown, Sparkles, Building2, Download, Copy, Edit } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { CoverageTierBadge } from "@/components/CoverageTierBadge";
import { CommitteeBreakdown } from "@/components/admin/CommitteeBreakdown";
import { CommitteeLinkStatusBadge } from "@/components/admin/CommitteeLinkStatusBadge";
import { FinanceSummaryCard, type FinanceSummaryData } from "@/components/FinanceSummaryCard";
import { RecentErrorsPanel } from "@/components/admin/RecentErrorsPanel";
import { SyncStatusBadge } from "@/components/admin/SyncStatusBadge";
import { FinanceStatusBadge } from "@/components/admin/FinanceStatusBadge";
import { CandidateHealthBadge } from "@/components/admin/CandidateHealthBadge";
import { CandidateEditDialog } from "@/components/admin/CandidateEditDialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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

function TopicCoverageItem({ topic }: { topic: TopicCoverage }) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 hover:bg-muted/50 rounded-md transition-colors">
      <span className="text-lg w-8">{topic.icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate">{topic.topicName}</span>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground whitespace-nowrap">
          {topic.totalActualAnswers.toLocaleString()} / {topic.totalPotentialAnswers.toLocaleString()}
        </span>
        <div className="w-16">
          <Progress value={topic.coveragePercent} className="h-2" />
        </div>
        <span className={`font-medium w-14 text-right ${getCoverageColor(topic.coveragePercent)}`}>
          {topic.coveragePercent}%
        </span>
      </div>
    </div>
  );
}

export function AnswerCoveragePanel() {
  const { data: syncStats, isLoading: syncLoading, refetch: refetchSyncStats, isRefetching } = useSyncStats();
  const { data: candidateStats, isLoading: statsLoading } = useCandidateAnswerStats();
  const { data: states } = useUniqueStates();

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [partyFilter, setPartyFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [coverageFilter, setCoverageFilter] = useState<'all' | 'none' | 'low' | 'full'>('none');
  const [financeFilter, setFinanceFilter] = useState<'all' | 'mismatch'>('all');
  const [syncFilter, setSyncFilter] = useState<'all' | 'needs_sync' | 'partial' | 'complete' | 'has_committee' | 'no_committee' | 'has_donors' | 'no_donors'>('all');
  
  // Edit dialog state
  const [editingCandidate, setEditingCandidate] = useState<CandidateAnswerCoverage | null>(null);

  const { data: candidates, isLoading: candidatesLoading, refetch: refetchCandidates } = useCandidatesAnswerCoverage({
    party: partyFilter,
    state: stateFilter,
    coverageFilter,
  });
  
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
  const { recalculateAll, isRecalculatingAll } = useRecalculateCoverageTiers();
  const { 
    fetchFECCandidateId, 
    fetchFECCommittees,
    fetchFECDonors, 
    batchFetchFECIds,
    batchFetchDonors,
    resumeAllPartialSyncs,
    syncAllCandidatesComplete,
    cancelSyncAll,
    clearSyncAllProgress,
    triggerReconciliation,
    isLoading: isFECLoading, 
    isDonorLoading,
    isCommitteeLoading,
    isReconcileLoading,
    hasPartialSync,
    batchProgress: fecBatchProgress,
    isBatchRunning: isFECBatchRunning,
    syncAllProgress,
    isSyncAllRunning
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

  const formatCurrency = (value?: number | null) => {
    if (value === null || value === undefined) return '—';
    return `$${Math.round(value).toLocaleString()}`;
  };

  // Sync stats from ALL candidates (not filtered)
  const syncStats_ = useMemo(() => {
    if (!candidates) return { withFecId: 0, neverSynced: 0, partial: 0, complete: 0 };
    const withFecId = candidates.filter(c => !!c.fecCandidateId).length;
    const neverSynced = candidates.filter(c => c.syncStatus === 'never' && c.fecCandidateId).length;
    const partial = candidates.filter(c => c.syncStatus === 'partial').length;
    const complete = candidates.filter(c => c.syncStatus === 'complete').length;
    return { withFecId, neverSynced, partial, complete };
  }, [candidates]);

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

  const filteredCandidates = useMemo(() => {
    let result = baseFilteredCandidates;
    
    // Apply finance filter
    if (financeFilter === 'mismatch') {
      result = result.filter(candidate => {
        const status = candidate.reconciliationStatus;
        return status === 'warning' || status === 'error';
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
    }
    
    return result;
  }, [baseFilteredCandidates, financeFilter, syncFilter]);
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
      const results = await batchFetchDonors(toProcess, '2024');
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
      const results = await resumeAllPartialSyncs(toProcess, '2024');
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

  const noAnswersCount = candidateStats?.noAnswers || 0;
  const lowCoverageCount = candidateStats?.lowCoverage || 0;

  const isLoading_ = syncLoading || statsLoading;
  const anyBatchRunning = isBatchRunning || isFECBatchRunning || isSyncAllRunning;

  if (isLoading_) {
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
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
          <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Coverage & Finance Dashboard
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
                      Fill Missing ({Math.min(noAnswersCount, 50)})
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Generate AI Answers?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will generate AI answers for up to 50 candidates with no answers.
                        This may take several minutes.
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
                      Regen Low Coverage ({Math.min(lowCoverageCount, 50)})
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Regenerate Low Coverage Answers?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will regenerate AI answers for up to 50 candidates with less than 50% coverage.
                        Existing answers will be replaced.
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
                      Recalculate Tiers
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
                      Link FEC IDs ({candidatesWithoutFecId.length})
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Bulk Lookup FEC Candidate IDs?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will search the FEC database for candidates without FEC IDs and link them automatically.
                        Up to 50 candidates will be processed.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleBatchLinkFECIds}>Link FEC IDs</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Building2 className="h-4 w-4 mr-2" />
                      Link Committees ({noCommitteeCandidates.length})
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Bulk Link FEC Committees?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will fetch and link FEC committees for {noCommitteeCandidates.length} candidate(s) with FEC IDs but no committees yet.
                        Up to 50 candidates will be processed.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleBatchLinkCommittees}>Link Committees</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <DollarSign className="h-4 w-4 mr-2" />
                      Fetch Donors ({candidatesWithFecId.length})
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Bulk Fetch FEC Donor Data?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will fetch donor contributions from the FEC API for all candidates with FEC IDs.
                        Up to 50 candidates will be processed. This may take several minutes.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleBatchFetchDonors}>Fetch Donors</AlertDialogAction>
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
                          Resume All Partial ({partialSyncCandidates.length})
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Resume All Partial Syncs?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {partialSyncCandidates.length} candidate(s) have incomplete donor syncs. 
                            This will continue fetching from where each sync stopped until complete.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleResumeAllPartialSyncs}>Resume All</AlertDialogAction>
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
                      Sync All Until Complete
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Sync All Candidates Until Complete?</AlertDialogTitle>
                      <AlertDialogDescription className="space-y-2">
                        <p>
                          This will continuously sync ALL candidates with FEC IDs until their donor data is fully imported.
                          The process will run in your browser until complete.
                        </p>
                        <ul className="list-disc pl-4 text-sm space-y-1">
                          <li>Candidates without any sync will be synced from scratch</li>
                          <li>Candidates with partial syncs will resume from where they stopped</li>
                          <li>You can cancel at any time with the Stop button</li>
                          <li>This may take a long time depending on the number of candidates</li>
                        </ul>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => syncAllCandidatesComplete('2024')}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        Start Sync All
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
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
        {/* Overall Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Users className="h-4 w-4" />
              Total Reps
            </div>
            <div className="text-2xl font-bold">{syncStats?.totalCandidates.toLocaleString() || 0}</div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <HelpCircle className="h-4 w-4" />
              Total Questions
            </div>
            <div className="text-2xl font-bold">{syncStats?.totalQuestions.toLocaleString() || 0}</div>
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

        {/* FEC Sync Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Link2 className="h-4 w-4" />
              With FEC ID
            </div>
            <div className="text-2xl font-bold">{syncStats_.withFecId}</div>
          </div>

          <div className="bg-muted/30 rounded-lg p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              Never Synced
            </div>
            <div className="text-2xl font-bold text-muted-foreground">{syncStats_.neverSynced}</div>
          </div>

          <div className="bg-amber-500/10 rounded-lg p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <RotateCcw className="h-4 w-4 text-amber-600" />
              Partial Sync
            </div>
            <div className="text-2xl font-bold text-amber-600">{syncStats_.partial}</div>
          </div>

          <div className="bg-green-500/10 rounded-lg p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Complete
            </div>
            <div className="text-2xl font-bold text-green-600">{syncStats_.complete}</div>
          </div>
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

        {/* Tabs for Rep vs Topic view */}
        <Tabs defaultValue="representatives" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="representatives">By Representative</TabsTrigger>
            <TabsTrigger value="topics">By Topic</TabsTrigger>
          </TabsList>

          <TabsContent value="representatives" className="mt-4 space-y-4">
            {/* Search and Filters */}
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

              <Select value={coverageFilter} onValueChange={(v) => setCoverageFilter(v as typeof coverageFilter)}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Coverage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Coverage</SelectItem>
                  <SelectItem value="none">No Answers</SelectItem>
                  <SelectItem value="low">Low (&lt;50%)</SelectItem>
                  <SelectItem value="full">Full (100%)</SelectItem>
                </SelectContent>
              </Select>

              <Select value={financeFilter} onValueChange={(v) => setFinanceFilter(v as typeof financeFilter)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Finance" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Finance</SelectItem>
                  <SelectItem value="mismatch">FEC Mismatch</SelectItem>
                </SelectContent>
              </Select>

              <Select value={syncFilter} onValueChange={(v) => setSyncFilter(v as typeof syncFilter)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Sync Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sync Status</SelectItem>
                  <SelectItem value="no_committee">No Committee ({noCommitteeCandidates.length})</SelectItem>
                  <SelectItem value="needs_sync">Needs Sync ({needsSyncCandidates.length})</SelectItem>
                  <SelectItem value="partial">Partial ({partialSyncCandidates.length})</SelectItem>
                  <SelectItem value="complete">Complete ({completeSyncCandidates.length})</SelectItem>
                </SelectContent>
              </Select>

              <Select value={partyFilter} onValueChange={setPartyFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Party" />
                </SelectTrigger>
                <SelectContent>
                  {PARTIES.map((party) => (
                    <SelectItem key={party} value={party}>
                      {party === 'all' ? 'All Parties' : party}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={stateFilter} onValueChange={setStateFilter}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="State" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  {states?.map((state) => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Candidates Table */}
            {candidatesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredCandidates.length > 0 ? (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-[60px]">Party</TableHead>
                      <TableHead className="w-[60px]">State</TableHead>
                      <TableHead className="text-center w-[100px]">Answers</TableHead>
                      <TableHead className="w-[80px]">Tier</TableHead>
                      <TableHead className="w-[70px]">Health</TableHead>
                      <TableHead className="w-[100px]">Committee</TableHead>
                      <TableHead className="w-[80px]">Sync</TableHead>
                      <TableHead className="w-[90px]">Finance</TableHead>
                      <TableHead className="w-[100px]">FEC ID</TableHead>
                      <TableHead className="text-right w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCandidates.slice(0, 100).map((candidate) => {
                      const loading = isLoading(candidate.id);
                      const fecLoading = isFECLoading(candidate.id);
                      const donorLoading = isDonorLoading(candidate.id);
                      const isComplete = candidate.percentage >= 100;
                      const hasFecId = !!candidate.fecCandidateId;
                      const hasCommittee = !!candidate.fecCommitteeId;
                      const financeStatus = calculateFinanceStatus(candidate);
                      const localItemized = candidate.localItemized || 0;
                      const syncStatus = candidate.syncStatus;
                      const hasOverride = overrideMap.has(candidate.id);
                      
                      // Calculate finance badge status
                      const getFinanceBadgeStatus = (): 'ok' | 'warning' | 'error' | null => {
                        if (!financeStatus.hasData) return null;
                        if (financeStatus.isBalanced) return 'ok';
                        // Use otherReceipts as a rough proxy - if > 20% of total, warning, else error
                        const otherPct = financeStatus.otherReceipts / (financeStatus.fecTotalReceipts || 1) * 100;
                        if (otherPct <= 30) return 'warning';
                        return 'error';
                      };

                      return (
                        <TableRow key={candidate.id}>
                          <TableCell className="font-medium">
                            <Link
                              to={`/candidate/${candidate.id}`}
                              className="hover:underline text-primary flex items-center gap-1"
                            >
                              {candidate.name}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge className={getPartyBadgeColor(candidate.party)}>
                              {getPartyBadge(candidate.party)}
                            </Badge>
                          </TableCell>
                          <TableCell>{candidate.state}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {isComplete ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              ) : (
                                <span className={candidate.answerCount === 0 ? 'text-amber-600' : 'text-foreground'}>
                                  {candidate.answerCount}/{candidate.totalQuestions}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">({candidate.percentage}%)</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <CoverageTierBadge tier={candidate.coverageTier} showTooltip={false} />
                          </TableCell>
                          {/* Health Badge */}
                          <TableCell>
                            <CandidateHealthBadge
                              hasFecId={hasFecId}
                              hasCommittee={hasCommittee}
                              syncStatus={syncStatus}
                              financeStatus={getFinanceBadgeStatus() || 'none'}
                              hasOverride={hasOverride}
                            />
                          </TableCell>
                          {/* Committee Status Badge - NEW COLUMN */}
                          <TableCell>
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
                          {/* Sync Status Badge */}
                          <TableCell>
                            <SyncStatusBadge
                              status={syncStatus}
                              lastSyncDate={candidate.lastDonorSync}
                              reconciliationCheckedAt={candidate.reconciliationCheckedAt}
                              hasFecId={hasFecId}
                            />
                          </TableCell>
                          {/* Finance Status Badge */}
                          <TableCell>
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="hover:opacity-80 transition-opacity">
                                  <FinanceStatusBadge
                                    status={getFinanceBadgeStatus()}
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
                          {/* FEC ID column - simplified */}
                          <TableCell>
                            {hasFecId ? (
                              <Badge variant="outline" className="text-xs font-mono">
                                {candidate.fecCandidateId?.slice(0, 9)}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground/50 text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              {/* Link FEC ID */}
                              {!hasFecId && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={fecLoading || anyBatchRunning}
                                  onClick={() => {
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
                                  title="Link FEC ID"
                                >
                                  {fecLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                                </Button>
                              )}
                              {/* Fetch/Resume Donors - now shown if has committee */}
                              {hasFecId && candidate.fecCommitteeId && (
                                <Button
                                  size="sm"
                                  variant={syncStatus === 'partial' ? "default" : "ghost"}
                                  disabled={donorLoading || anyBatchRunning}
                                  onClick={() => {
                                    void (async () => {
                                      try {
                                        const result = await fetchFECDonors(
                                          candidate.id,
                                          candidate.fecCandidateId!,
                                          '2024'
                                        );
                                        if (result.success) {
                                          if (result.hasMore) {
                                            toast.info(result.message || `Partial: ${result.imported} donors. Resume to continue.`);
                                          } else {
                                            toast.success(result.message || `Imported ${result.imported} donors`);
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
                                  title={syncStatus === 'partial' ? "Resume sync" : "Fetch donors"}
                                  className={syncStatus === 'partial' ? "bg-amber-600 hover:bg-amber-700 h-7 text-xs" : "h-7"}
                                >
                                  {donorLoading ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : syncStatus === 'partial' ? (
                                    <>
                                      <RotateCcw className="h-3 w-3 mr-1" />
                                      Resume
                                    </>
                                  ) : (
                                    <DollarSign className="h-3 w-3" />
                                  )}
                                </Button>
                              )}
                              {/* Refresh Finance Reconciliation */}
                              {hasFecId && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={isReconcileLoading(candidate.id) || anyBatchRunning}
                                  onClick={() => {
                                    void (async () => {
                                      try {
                                        const result = await triggerReconciliation(candidate.id, '2024');
                                        if (result.success) {
                                          toast.success(`Finance refreshed: ${result.status}`);
                                          refetchCandidates();
                                        } else {
                                          toast.error(result.error || 'Reconciliation failed');
                                        }
                                      } catch (err) {
                                        console.error('[Admin] Reconciliation failed:', err);
                                        toast.error('Failed to refresh finance');
                                      }
                                    })();
                                  }}
                                  title="Refresh finance reconciliation"
                                  className="h-7"
                                >
                                  {isReconcileLoading(candidate.id) ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Calculator className="h-3 w-3" />
                                  )}
                                </Button>
                              )}
                              {/* Generate answers */}
                              {candidate.answerCount < candidate.totalQuestions && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={loading || anyBatchRunning}
                                  onClick={() => populateCandidate(candidate.id, false)}
                                  title="Generate AI answers"
                                  className="h-7"
                                >
                                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                                </Button>
                              )}
                              {/* Regenerate answers */}
                              {candidate.answerCount > 0 && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={loading || anyBatchRunning}
                                  onClick={() => populateCandidate(candidate.id, true)}
                                  title="Regenerate answers"
                                  className="h-7"
                                >
                                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {filteredCandidates.length > 100 && (
                  <div className="p-4 text-center text-sm text-muted-foreground border-t">
                    Showing first 100 of {filteredCandidates.length} candidates. Use filters to narrow down.
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <p className="text-lg font-medium">
                  {searchQuery ? 'No matches found' : 'All candidates covered!'}
                </p>
                <p className="text-muted-foreground">
                  {searchQuery
                    ? `No candidates matching "${searchQuery}"`
                    : coverageFilter === 'none'
                    ? 'No candidates without answers found.'
                    : coverageFilter === 'low'
                    ? 'No candidates with low coverage found.'
                    : 'No candidates match the current filters.'}
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="topics" className="mt-4">
            <div className="space-y-1">
              {syncStats?.topicCoverage.map(topic => (
                <TopicCoverageItem key={topic.topicId} topic={topic} />
              ))}
            </div>
            {(!syncStats?.topicCoverage || syncStats.topicCoverage.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No topics found
              </p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
