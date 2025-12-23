import { useState } from "react";
import { Link } from "react-router-dom";
import { useSyncStats, TopicCoverage, CandidateCoverage } from "@/hooks/useSyncStats";
import { useCandidatesAnswerCoverage, useCandidateAnswerStats, useUniqueStates, useRecalculateCoverageTiers } from "@/hooks/useCandidatesAnswerCoverage";
import { usePopulateCandidateAnswers } from "@/hooks/usePopulateCandidateAnswers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, RefreshCw, BarChart3, Users, FileText, HelpCircle, Search, Plus, ExternalLink, CheckCircle2, Pause, Play, X, AlertTriangle, Calculator, Vote, DollarSign } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { CoverageTierBadge, ConfidenceBadge } from "@/components/CoverageTierBadge";
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

  const { data: candidates, isLoading: candidatesLoading } = useCandidatesAnswerCoverage({
    party: partyFilter,
    state: stateFilter,
    coverageFilter,
  });

  const { populateCandidate, populateBatch, pauseBatch, resumeBatch, cancelBatch, isLoading, isBatchRunning, batchProgress } = usePopulateCandidateAnswers();
  const { recalculateAll, recalculateSingle, isRecalculatingAll, isRecalculatingSingle } = useRecalculateCoverageTiers();
  // Filter candidates by search query
  const filteredCandidates = candidates?.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

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
                      <TableHead>Party</TableHead>
                      <TableHead>Office</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead className="text-center">Answers</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCandidates.slice(0, 100).map((candidate) => {
                      const loading = isLoading(candidate.id);
                      const isComplete = candidate.percentage >= 100;

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
                          <TableCell className="max-w-[150px] truncate">{candidate.office}</TableCell>
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
                            <ConfidenceBadge confidence={candidate.confidence} />
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
                                <span className="flex items-center gap-1" title="Donors">
                                  <DollarSign className="h-3 w-3" />
                                  {candidate.donorCount}
                                </span>
                              )}
                              {candidate.voteCount === 0 && candidate.donorCount === 0 && (
                                <span className="text-muted-foreground/50">—</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
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
                                      Generate
                                    </>
                                  )}
                                </Button>
                              )}
                              {/* Regenerate button - visible when there are existing answers */}
                              {candidate.answerCount > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={loading || isBatchRunning}
                                  onClick={() => populateCandidate(candidate.id, true)}
                                >
                                  {loading ? (
                                    <>
                                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                      ...
                                    </>
                                  ) : (
                                    <>
                                      <RefreshCw className="h-3 w-3 mr-1" />
                                      Regen
                                    </>
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
