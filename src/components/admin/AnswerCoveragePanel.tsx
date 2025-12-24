import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSyncStats, TopicCoverage } from "@/hooks/useSyncStats";
import { useCandidatesAnswerCoverage, useCandidateAnswerStats, useUniqueStates, useRecalculateCoverageTiers, CandidateAnswerCoverage } from "@/hooks/useCandidatesAnswerCoverage";
import { usePopulateCandidateAnswers } from "@/hooks/usePopulateCandidateAnswers";
import { useFECIntegration } from "@/hooks/useFECIntegration";
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
import { Loader2, RefreshCw, BarChart3, Users, FileText, HelpCircle, Search, Plus, ExternalLink, CheckCircle2, Pause, Play, X, AlertTriangle, Calculator, Vote, DollarSign, Link2, RotateCcw, ChevronDown, Sparkles, Building2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { CoverageTierBadge } from "@/components/CoverageTierBadge";
import { CommitteeBreakdown } from "@/components/admin/CommitteeBreakdown";
import { FinanceSummaryCard, type FinanceSummaryData } from "@/components/FinanceSummaryCard";
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
  const { data: syncStats, isLoading: syncLoading, refetch, isRefetching } = useSyncStats();
  const { data: candidateStats, isLoading: statsLoading } = useCandidateAnswerStats();
  const { data: states } = useUniqueStates();

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [partyFilter, setPartyFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [coverageFilter, setCoverageFilter] = useState<'all' | 'none' | 'low' | 'full'>('none');
  const [financeFilter, setFinanceFilter] = useState<'all' | 'mismatch' | 'partial'>('all');

  const { data: candidates, isLoading: candidatesLoading } = useCandidatesAnswerCoverage({
    party: partyFilter,
    state: stateFilter,
    coverageFilter,
  });

  const { populateCandidate, populateBatch, pauseBatch, resumeBatch, cancelBatch, isLoading, isBatchRunning, batchProgress } = usePopulateCandidateAnswers();
  const { recalculateAll, isRecalculatingAll } = useRecalculateCoverageTiers();
  const { 
    fetchFECCandidateId, 
    fetchFECCommittees,
    fetchFECDonors, 
    batchFetchFECIds,
    batchFetchDonors,
    resumeAllPartialSyncs,
    isLoading: isFECLoading, 
    isDonorLoading,
    isCommitteeLoading,
    hasPartialSync,
    batchProgress: fecBatchProgress,
    isBatchRunning: isFECBatchRunning
  } = useFECIntegration();
  
  const baseFilteredCandidates = useMemo(() => (
    candidates?.filter(c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase())
    ) || []
  ), [candidates, searchQuery]);

  // Finance status is now calculated from reconciliation data (single source of truth)
  // Uses localItemizedNet for comparison with FEC (excludes earmark pass-throughs)
  const calculateFinanceStatus = useCallback((candidate: CandidateAnswerCoverage) => {
    const localItemizedNet = candidate.localItemizedNet || 0;
    const localItemized = candidate.localItemized || 0;
    const fecItemized = candidate.fecItemized;
    
    if (fecItemized === null) {
      return { 
        mismatch: false, 
        difference: 0, 
        fecItemized: null, 
        receipts: null, 
        status: candidate.reconciliationStatus,
        localNet: localItemizedNet,
        localGross: localItemized,
        earmarkPassThroughs: localItemized - localItemizedNet
      };
    }
    
    const difference = candidate.deltaAmount || Math.abs(fecItemized - localItemizedNet);
    const status = candidate.reconciliationStatus;
    
    return {
      mismatch: status === 'warning' || status === 'error',
      difference,
      fecItemized,
      receipts: candidate.fecTotalReceipts,
      status,
      localNet: localItemizedNet,
      localGross: localItemized,
      earmarkPassThroughs: localItemized - localItemizedNet
    };
  }, []);

  const formatCurrency = (value?: number | null) => {
    if (value === null || value === undefined) return '—';
    return `$${Math.round(value).toLocaleString()}`;
  };

  // Get counts for batch action buttons
  const partialSyncCandidates = useMemo(() => 
    baseFilteredCandidates.filter(c => (c.hasPartialSync || hasPartialSync(c.id)) && c.fecCandidateId),
    [baseFilteredCandidates, hasPartialSync]
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
    if (financeFilter === 'mismatch') {
      return baseFilteredCandidates.filter(candidate => {
        const status = candidate.reconciliationStatus;
        return status === 'warning' || status === 'error';
      });
    }
    if (financeFilter === 'partial') {
      return baseFilteredCandidates.filter(c => c.hasPartialSync || hasPartialSync(c.id));
    }
    return baseFilteredCandidates;
  }, [baseFilteredCandidates, financeFilter, hasPartialSync]);
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
      refetch();
    } catch (err) {
      console.error('[Admin] Batch link FEC IDs failed:', err);
      toast.error('Failed to link FEC IDs');
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
      refetch();
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
      refetch();
    } catch (err) {
      console.error('[Admin] Resume partial syncs failed:', err);
      toast.error('Failed to resume donor syncs');
    }
  };

  const noAnswersCount = candidateStats?.noAnswers || 0;
  const lowCoverageCount = candidateStats?.lowCoverage || 0;

  const isLoading_ = syncLoading || statsLoading;
  const anyBatchRunning = isBatchRunning || isFECBatchRunning;

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
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Refresh button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
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
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Sync Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Syncs</SelectItem>
                  <SelectItem value="partial">Partial Syncs</SelectItem>
                  <SelectItem value="mismatch">FEC Mismatch</SelectItem>
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
                      <TableHead className="w-[90px]">Data</TableHead>
                      <TableHead className="w-[120px]">Contributions</TableHead>
                      <TableHead className="w-[100px]">FEC ID</TableHead>
                      <TableHead className="text-right w-[140px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCandidates.slice(0, 100).map((candidate) => {
                      const loading = isLoading(candidate.id);
                      const fecLoading = isFECLoading(candidate.id);
                      const donorLoading = isDonorLoading(candidate.id);
                      const isComplete = candidate.percentage >= 100;
                      const hasFecId = !!candidate.fecCandidateId;
                      const financeStatus = calculateFinanceStatus(candidate);
                      const localItemized = candidate.localItemized || 0;
                      const isPartialSync = candidate.hasPartialSync || hasPartialSync(candidate.id);

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
                          <TableCell>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {candidate.voteCount > 0 && (
                                <span className="flex items-center gap-0.5" title="Voting records">
                                  <Vote className="h-3 w-3" />
                                  {candidate.voteCount}
                                </span>
                              )}
                              {candidate.donorCount > 0 && (
                                <span className="flex items-center gap-0.5 text-green-600" title="Donors">
                                  <DollarSign className="h-3 w-3" />
                                  {candidate.donorCount}
                                </span>
                              )}
                              {isPartialSync && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-amber-600 border-amber-300">
                                  Partial
                                </Badge>
                              )}
                              {candidate.voteCount === 0 && candidate.donorCount === 0 && !isPartialSync && (
                                <span className="text-muted-foreground/50">—</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="space-y-0.5 text-xs text-left hover:bg-muted/50 p-1 -m-1 rounded cursor-pointer">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-muted-foreground">Net</span>
                                    <span className="font-medium">{formatCurrency(financeStatus.localNet)}</span>
                                  </div>
                                  {financeStatus.fecItemized !== null && (
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-muted-foreground">FEC</span>
                                      <span className={financeStatus.mismatch ? 'text-amber-600 font-medium' : ''}>
                                        {formatCurrency(financeStatus.fecItemized)}
                                      </span>
                                    </div>
                                  )}
                                  {financeStatus.mismatch && (
                                    <div className="flex items-center gap-1 text-amber-600 mt-0.5">
                                      <AlertTriangle className="h-3 w-3" />
                                      <span>Δ {formatCurrency(financeStatus.difference)}</span>
                                    </div>
                                  )}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-72 p-3" align="start">
                                <FinanceSummaryCard
                                  data={{
                                    localGross: financeStatus.localGross,
                                    localNet: financeStatus.localNet,
                                    fecItemized: financeStatus.fecItemized,
                                    fecUnitemized: candidate.fecUnitemized,
                                    fecTotalReceipts: financeStatus.receipts,
                                    deltaAmount: candidate.deltaAmount,
                                    deltaPct: candidate.deltaPct,
                                    status: financeStatus.status,
                                  } as FinanceSummaryData}
                                  compact
                                />
                              </PopoverContent>
                            </Popover>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              {hasFecId ? (
                                <Badge variant="outline" className="text-xs font-mono">
                                  {candidate.fecCandidateId?.slice(0, 9)}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground/50 text-xs">—</span>
                              )}
                              {hasFecId && candidate.fecCommitteeId && (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button className="text-[10px] text-green-600 font-mono hover:underline cursor-pointer text-left">
                                      {candidate.fecCommitteeId.slice(0, 9)} ▾
                                    </button>
                                  </PopoverTrigger>
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
                                        onRefetch={refetch}
                                      />
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              )}
                              {hasFecId && !candidate.fecCommitteeId && (
                                <div className="flex items-center gap-1 text-[10px] text-amber-600">
                                  <AlertTriangle className="h-3 w-3" />
                                  <span>No committee</span>
                                </div>
                              )}
                            </div>
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
                                          refetch();
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
                              {/* Link Committees */}
                              {hasFecId && !candidate.fecCommitteeId && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isCommitteeLoading(candidate.id) || anyBatchRunning}
                                  onClick={() => {
                                    void (async () => {
                                      try {
                                        const result = await fetchFECCommittees(
                                          candidate.id,
                                          candidate.fecCandidateId!
                                        );
                                        if (result.success && result.primaryCommitteeId) {
                                          toast.success(`Linked committee: ${result.primaryCommitteeId}`);
                                          refetch();
                                        } else if (result.success) {
                                          toast.info('No committees found for this candidate');
                                        } else {
                                          toast.error(result.error || 'Failed to link committees');
                                        }
                                      } catch (err) {
                                        console.error('[Admin] Link committees failed:', err);
                                        toast.error('Failed to link committees');
                                      }
                                    })();
                                  }}
                                  title="Link FEC Committee"
                                  className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                                >
                                  {isCommitteeLoading(candidate.id) ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <>
                                      <Building2 className="h-3 w-3 mr-1" />
                                      Link Cmte
                                    </>
                                  )}
                                </Button>
                              )}
                              {/* Fetch/Resume Donors */}
                              {hasFecId && candidate.fecCommitteeId && (
                                <Button
                                  size="sm"
                                  variant={isPartialSync ? "default" : "ghost"}
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
                                          refetch();
                                        } else {
                                          toast.error(result.error || 'Failed');
                                        }
                                      } catch (err) {
                                        console.error('[Admin] Fetch donors failed:', err);
                                        toast.error('Failed to fetch donors');
                                      }
                                    })();
                                  }}
                                  title={isPartialSync ? "Resume sync" : "Fetch donors"}
                                  className={isPartialSync ? "bg-amber-600 hover:bg-amber-700 h-7 text-xs" : "h-7"}
                                >
                                  {donorLoading ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : isPartialSync ? (
                                    <>
                                      <RotateCcw className="h-3 w-3 mr-1" />
                                      Resume
                                    </>
                                  ) : (
                                    <DollarSign className="h-3 w-3" />
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
