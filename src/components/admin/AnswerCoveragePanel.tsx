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
import { Loader2, RefreshCw, BarChart3, Users, FileText, HelpCircle, Search, Plus, ExternalLink, CheckCircle2, Pause, Play, X, AlertTriangle, Calculator, Vote, DollarSign, Link2, RotateCcw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { CoverageTierBadge } from "@/components/CoverageTierBadge";
import { toast } from "sonner";

const PARTIES = ['all', 'Democrat', 'Republican', 'Independent', 'Other'] as const;

function getPartyColor(party: string) {
  switch (party) {
    case "Democrat": return "text-blue-600 dark:text-blue-400";
    case "Republican": return "text-red-600 dark:text-red-400";
    case "Independent": return "text-purple-600 dark:text-purple-400";
    default: return "text-muted-foreground";
  }
}

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
  const [financeFilter, setFinanceFilter] = useState<'all' | 'mismatch'>('all');
  const [fecTotalsMap, setFecTotalsMap] = useState<Record<string, { totalReceipts: number; itemizedContributions: number }>>({});
  const [financeLoading, setFinanceLoading] = useState(false);

  const { data: candidates, isLoading: candidatesLoading } = useCandidatesAnswerCoverage({
    party: partyFilter,
    state: stateFilter,
    coverageFilter,
  });

  const { populateCandidate, populateBatch, pauseBatch, resumeBatch, cancelBatch, isLoading, isBatchRunning, batchProgress } = usePopulateCandidateAnswers();
  const { recalculateAll, recalculateSingle, isRecalculatingAll, isRecalculatingSingle } = useRecalculateCoverageTiers();
  const { 
    fetchFECCandidateId, 
    fetchFECDonors, 
    batchFetchFECIds,
    batchFetchDonors,
    resumeAllPartialSyncs,
    isLoading: isFECLoading, 
    isDonorLoading,
    hasPartialSync,
    batchProgress: fecBatchProgress,
    isBatchRunning: isFECBatchRunning
  } = useFECIntegration();
  
  const baseFilteredCandidates = useMemo(() => (
    candidates?.filter(c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase())
    ) || []
  ), [candidates, searchQuery]);

  const calculateFinanceStatus = useCallback((candidate: CandidateAnswerCoverage) => {
    const totals = fecTotalsMap[candidate.id];
    const localItemized = candidate.localItemizedContributions || 0;
    if (!totals) {
      return { mismatch: false, difference: 0, fecItemized: null, receipts: null };
    }
    const difference = Math.abs((totals.itemizedContributions || 0) - localItemized);
    const tolerance = Math.max(500, (totals.itemizedContributions || 0) * 0.02);
    return {
      mismatch: difference > tolerance,
      difference,
      fecItemized: totals.itemizedContributions,
      receipts: totals.totalReceipts,
    };
  }, [fecTotalsMap]);

  const formatCurrency = (value?: number | null) => {
    if (value === null || value === undefined) return '—';
    return `$${Math.round(value).toLocaleString()}`;
  };

  const filteredCandidates = useMemo(() => {
    if (financeFilter === 'mismatch') {
      return baseFilteredCandidates.filter(candidate => calculateFinanceStatus(candidate).mismatch);
    }
    return baseFilteredCandidates;
  }, [baseFilteredCandidates, financeFilter, calculateFinanceStatus]);

  useEffect(() => {
    let isActive = true;
    const fetchFecTotals = async () => {
      const toFetch = baseFilteredCandidates
        .filter(c => c.fecCommitteeId && !fecTotalsMap[c.id])
        .slice(0, 100);

      if (toFetch.length === 0) return;
      setFinanceLoading(true);
      const apiKey = import.meta.env.VITE_FEC_API_KEY || 'DEMO_KEY';
      const results: Record<string, { totalReceipts: number; itemizedContributions: number }> = {};

      for (const candidate of toFetch) {
        try {
          const response = await fetch(
            `https://api.open.fec.gov/v1/committee/${candidate.fecCommitteeId}/totals/?api_key=${apiKey}&cycle=2024&per_page=1`
          );

          if (!response.ok) continue;
          const data = await response.json();
          const totalReceipts = data?.results?.[0]?.receipts || 0;
          const itemizedContributions = data?.results?.[0]?.individual_itemized_contributions || 0;
          results[candidate.id] = {
            totalReceipts,
            itemizedContributions,
          };
          // small delay to avoid hammering API
          await new Promise(resolve => setTimeout(resolve, 150));
        } catch (error) {
          console.error('[FEC Totals] Failed to fetch totals for', candidate.name, error);
        }
      }

      if (!isActive) return;
      if (Object.keys(results).length > 0) {
        setFecTotalsMap(prev => ({ ...prev, ...results }));
      }
      setFinanceLoading(false);
    };

    fetchFecTotals();
    return () => { isActive = false; };
  }, [baseFilteredCandidates, fecTotalsMap]);

  const handleFillAll = async () => {
    if (!candidates) return;
    const toProcess = candidates.filter(c => c.answerCount === 0).slice(0, 50);
    await populateBatch(toProcess.map(c => ({ id: c.id, name: c.name })), false);
  };

  const handleFillLowCoverage = async () => {
    if (!candidates) return;
    const toProcess = candidates.filter(c => c.percentage > 0 && c.percentage < 50).slice(0, 50);
    await populateBatch(toProcess.map(c => ({ id: c.id, name: c.name })), true);
  };

  const noAnswersCount = candidateStats?.noAnswers || 0;
  const lowCoverageCount = candidateStats?.lowCoverage || 0;

  const isLoading_ = syncLoading || statsLoading;

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
              Answer Coverage Dashboard
            </CardTitle>
            <CardDescription>
              Manage and generate AI-powered position answers for representatives
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isRecalculatingAll}
                >
                  {isRecalculatingAll ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Calculator className="h-4 w-4" />
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Recalculate All Coverage Tiers?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will recalculate coverage tiers and confidence levels for all candidates based on their actual data:
                    <ul className="list-disc pl-4 mt-2 space-y-1">
                      <li><strong>tier_1 (Full)</strong>: ≥80% answers AND has votes or donors</li>
                      <li><strong>tier_2 (Partial)</strong>: ≥30% answers OR has votes or donors</li>
                      <li><strong>tier_3 (Basic)</strong>: Less than 30% answers, no votes/donors</li>
                    </ul>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={async () => {
                    try {
                      const result = await recalculateAll();
                      toast.success(`Coverage tiers recalculated: ${result?.[0]?.updated_count || 0} candidates updated`);
                    } catch (error) {
                      toast.error('Failed to recalculate coverage tiers');
                    }
                  }}>Recalculate</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isRefetching}
            >
              {isRefetching ? (
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

        {/* Batch Progress with Queue Controls */}
        {isBatchRunning && batchProgress && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {batchProgress.retrying ? (
                  <AlertTriangle className="h-4 w-4 text-amber-500 animate-pulse" />
                ) : batchProgress.paused ? (
                  <Pause className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                )}
                <span className="text-sm font-medium">
                  {batchProgress.paused 
                    ? 'Paused' 
                    : batchProgress.retrying 
                      ? `Retrying ${batchProgress.currentName} (attempt ${batchProgress.retryCount}/3)` 
                      : `Processing: ${batchProgress.currentName}`}
                </span>
              </div>
              <span className="text-sm text-muted-foreground">
                {batchProgress.completed} / {batchProgress.total}
              </span>
            </div>
            <Progress value={(batchProgress.completed / batchProgress.total) * 100} className="h-2" />
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
            <div className="flex flex-wrap gap-3">
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
                <SelectTrigger className="w-[140px]">
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
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Finance" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Finance</SelectItem>
                  <SelectItem value="mismatch">FEC Mismatch</SelectItem>
                </SelectContent>
              </Select>

              <Select value={partyFilter} onValueChange={setPartyFilter}>
                <SelectTrigger className="w-[140px]">
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

              <div className="flex-1" />

              {financeLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pr-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Syncing FEC totals...</span>
                </div>
              )}

              {noAnswersCount > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="default" size="sm" disabled={isBatchRunning}>
                      <Plus className="h-4 w-4 mr-2" />
                      Fill Missing ({Math.min(noAnswersCount, 50)})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Generate AI Answers?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will generate AI answers for up to 50 candidates with no answers.
                        This may take several minutes to complete.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleFillAll}>Generate</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {lowCoverageCount > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={isBatchRunning}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Regen Low ({Math.min(lowCoverageCount, 50)})
                    </Button>
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
              )}

              {/* Bulk FEC ID Lookup */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={isFECBatchRunning || isBatchRunning}>
                    <Link2 className="h-4 w-4 mr-2" />
                    Link FEC IDs
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Bulk Lookup FEC Candidate IDs?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will search the FEC database for candidates without FEC IDs and link them automatically.
                      Up to 50 candidates will be processed. This may take a few minutes.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={async () => {
                      const toProcess = (candidates || [])
                        .filter(c => !c.fecCandidateId)
                        .slice(0, 50)
                        .map(c => ({ id: c.id, name: c.name, state: c.state }));
                      
                      if (toProcess.length === 0) {
                        toast.info('All candidates already have FEC IDs');
                        return;
                      }

                      const results = await batchFetchFECIds(toProcess);
                      toast.success(`Linked ${results.success} FEC IDs (${results.failed} failed)`);
                      refetch();
                    }}>
                      Link FEC IDs
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Bulk Fetch Donors */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={isFECBatchRunning || isBatchRunning}>
                    <DollarSign className="h-4 w-4 mr-2" />
                    Fetch Donors
                  </Button>
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
                    <AlertDialogAction onClick={async () => {
                      const toProcess = (candidates || [])
                        .filter(c => c.fecCandidateId)
                        .slice(0, 50)
                        .map(c => ({ 
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
                    }}>
                      Fetch Donors
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Resume All Partial Syncs */}
              {(() => {
                const partialCandidates = (candidates || []).filter(c => c.hasPartialSync && c.fecCandidateId);
                if (partialCandidates.length === 0) return null;
                
                return (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        disabled={isFECBatchRunning || isBatchRunning}
                        className="border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Resume All ({partialCandidates.length})
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Resume All Partial Syncs?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {partialCandidates.length} candidate(s) have incomplete donor syncs. 
                          This will continue fetching from where each sync stopped until complete.
                          This may take several minutes.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={async () => {
                          const toProcess = partialCandidates.map(c => ({ 
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
                        }}>
                          Resume All
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                );
              })()}
            </div>

            {/* FEC Batch Progress */}
            {fecBatchProgress && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm font-medium">
                      FEC: Processing {fecBatchProgress.currentName}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {fecBatchProgress.current} / {fecBatchProgress.total}
                  </span>
                </div>
                <Progress value={(fecBatchProgress.current / fecBatchProgress.total) * 100} className="h-2" />
              </div>
            )}

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
                      <TableHead>Party</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead className="text-center">Answers</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>FEC Receipts</TableHead>
                      <TableHead>Itemized Contributions</TableHead>
                      <TableHead>FEC ID</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCandidates.slice(0, 100).map((candidate) => {
                      const loading = isLoading(candidate.id);
                      const fecLoading = isFECLoading(candidate.id);
                      const donorLoading = isDonorLoading(candidate.id);
                      const isComplete = candidate.percentage >= 100;
                      const hasFecId = !!candidate.fecCandidateId;
                      const financeTotals = fecTotalsMap[candidate.id];
                      const financeStatus = calculateFinanceStatus(candidate);
                      const localItemized = candidate.localItemizedContributions || 0;
                      // Use database-persisted partial sync OR hook-tracked partial sync
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
                            <div className="flex items-center justify-center gap-2">
                              {isComplete ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              ) : (
                                <span className={candidate.answerCount === 0 ? 'text-amber-600' : 'text-orange-600'}>
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
                                <span className="flex items-center gap-1" title="Voting records">
                                  <Vote className="h-3 w-3" />
                                  {candidate.voteCount}
                                </span>
                              )}
                              {candidate.donorCount > 0 && (
                                <span className="flex items-center gap-1 text-green-600" title="Donors">
                                  <DollarSign className="h-3 w-3" />
                                  {candidate.donorCount}
                                </span>
                              )}
                              {candidate.voteCount === 0 && candidate.donorCount === 0 && (
                                <span className="text-muted-foreground/50">—</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">
                              {formatCurrency(financeTotals?.totalReceipts)}
                            </div>
                            <p className="text-[11px] text-muted-foreground">FEC totals</p>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1 text-xs">
                              <div className="flex items-center justify-between">
                                <span>Direct</span>
                                <span className="font-semibold text-foreground">
                                  {formatCurrency(localItemized)}
                                </span>
                              </div>
                              {candidate.localTransfers > 0 && (
                                <div className="flex items-center justify-between text-muted-foreground">
                                  <span>Transfers</span>
                                  <span>{formatCurrency(candidate.localTransfers)}</span>
                                </div>
                              )}
                              {candidate.earmarkedAmount > 0 && (
                                <div className="flex items-center justify-between text-blue-600">
                                  <span>Earmarked</span>
                                  <span>{formatCurrency(candidate.earmarkedAmount)}</span>
                                </div>
                              )}
                              <div className="flex items-center justify-between border-t pt-1 mt-1">
                                <span className="text-muted-foreground">FEC</span>
                                <span className={financeStatus.mismatch ? 'text-amber-700 font-semibold' : 'text-muted-foreground'}>
                                  {financeStatus.fecItemized !== null 
                                    ? formatCurrency(financeStatus.fecItemized) 
                                    : '—'}
                                </span>
                              </div>
                              {financeStatus.mismatch && (
                                <div className="flex items-center justify-between text-amber-700">
                                  <span className="flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    Delta
                                  </span>
                                  <span>{formatCurrency(financeStatus.difference)}</span>
                                </div>
                              )}
                            </div>
                          </TableCell>
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
                            <div className="flex gap-1 justify-end flex-wrap">
                              {/* Link FEC ID button */}
                              {!hasFecId && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={fecLoading || isFECBatchRunning}
                                  onClick={async () => {
                                    const result = await fetchFECCandidateId(
                                      candidate.id,
                                      candidate.name,
                                      candidate.state,
                                      true
                                    );
                                    if (result.found && result.updated) {
                                      toast.success(`Linked FEC ID: ${result.fecCandidateId}`);
                                      refetch();
                                    } else if (result.found) {
                                      toast.info(`Found ${result.candidates?.length} matches but couldn't auto-link`);
                                    } else {
                                      toast.error('No FEC candidate found');
                                    }
                                  }}
                                  title="Look up FEC candidate ID"
                                >
                                  {fecLoading ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Link2 className="h-3 w-3" />
                                  )}
                                </Button>
                              )}
                              {/* Fetch/Resume Donors button - only when FEC ID exists */}
                              {hasFecId && (
                                <Button
                                  size="sm"
                                  variant={isPartialSync ? "default" : "outline"}
                                  disabled={donorLoading || isFECBatchRunning}
                                  onClick={async () => {
                                    const result = await fetchFECDonors(
                                      candidate.id,
                                      candidate.fecCandidateId!,
                                      '2024'
                                    );
                                    if (result.success) {
                                      if (result.hasMore) {
                                        toast.info(result.message || `Partial sync: ${result.imported} donors. Click Resume to continue.`);
                                      } else {
                                        toast.success(result.message || `Imported ${result.imported} donors`);
                                      }
                                      refetch();
                                    } else {
                                      toast.error(result.error || 'Failed to fetch donors');
                                    }
                                  }}
                                  title={isPartialSync ? "Resume sync from where it left off" : "Fetch donors from FEC"}
                                  className={isPartialSync ? "bg-amber-600 hover:bg-amber-700" : ""}
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
                              {/* Generate button - visible when there are missing answers */}
                              {candidate.answerCount < candidate.totalQuestions && (
                                <Button
                                  size="sm"
                                  variant="default"
                                  disabled={loading || isBatchRunning}
                                  onClick={() => populateCandidate(candidate.id, false)}
                                >
                                  {loading ? (
                                    <>
                                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                      ...
                                    </>
                                  ) : (
                                    <>
                                      <Plus className="h-3 w-3 mr-1" />
                                      Gen
                                    </>
                                  )}
                                </Button>
                              )}
                              {/* Regenerate button - visible when there are existing answers */}
                              {candidate.answerCount > 0 && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={loading || isBatchRunning}
                                  onClick={() => populateCandidate(candidate.id, true)}
                                  title="Regenerate answers"
                                >
                                  {loading ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-3 w-3" />
                                  )}
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
