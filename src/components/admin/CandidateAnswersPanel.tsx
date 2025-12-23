import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { Loader2, RefreshCw, Plus, ExternalLink, Sparkles, CheckCircle2 } from 'lucide-react';
import { useCandidatesAnswerCoverage, useCandidateAnswerStats, useUniqueStates } from '@/hooks/useCandidatesAnswerCoverage';
import { usePopulateCandidateAnswers } from '@/hooks/usePopulateCandidateAnswers';

const PARTIES = ['all', 'Democrat', 'Republican', 'Independent', 'Other'] as const;

export function CandidateAnswersPanel() {
  const [partyFilter, setPartyFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [coverageFilter, setCoverageFilter] = useState<'all' | 'none' | 'low' | 'full'>('none');

  const { data: stats, isLoading: statsLoading } = useCandidateAnswerStats();
  const { data: candidates, isLoading: candidatesLoading } = useCandidatesAnswerCoverage({
    party: partyFilter,
    state: stateFilter,
    coverageFilter,
  });
  const { data: states } = useUniqueStates();
  const { populateCandidate, populateBatch, isLoading, isBatchRunning, batchProgress } = usePopulateCandidateAnswers();

  const getPartyColor = (party: string) => {
    switch (party) {
      case 'Democrat': return 'bg-flag-blue text-white';
      case 'Republican': return 'bg-flag-red text-white';
      case 'Independent': return 'bg-purple-600 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const handleFillAll = async () => {
    if (!candidates) return;
    const toProcess = candidates.filter(c => c.answerCount === 0).slice(0, 50); // Limit batch size
    await populateBatch(toProcess.map(c => ({ id: c.id, name: c.name })), false);
  };

  const handleFillLowCoverage = async () => {
    if (!candidates) return;
    const toProcess = candidates.filter(c => c.percentage > 0 && c.percentage < 50).slice(0, 50);
    await populateBatch(toProcess.map(c => ({ id: c.id, name: c.name })), true);
  };

  const noAnswersCount = stats?.noAnswers || 0;
  const lowCoverageCount = stats?.lowCoverage || 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Candidate AI Answers
        </CardTitle>
        <CardDescription>
          Generate AI-powered position answers for candidates based on party affiliation and voting records.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stats Overview */}
        {statsLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold">{stats.totalCandidates}</p>
              <p className="text-sm text-muted-foreground">Total Candidates</p>
            </div>
            <div className="bg-amber-500/10 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{stats.noAnswers}</p>
              <p className="text-sm text-muted-foreground">No Answers</p>
            </div>
            <div className="bg-orange-500/10 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-orange-600">{stats.lowCoverage}</p>
              <p className="text-sm text-muted-foreground">Low Coverage (&lt;50%)</p>
            </div>
            <div className="bg-green-500/10 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{stats.fullCoverage}</p>
              <p className="text-sm text-muted-foreground">Full Coverage</p>
            </div>
          </div>
        )}

        {/* Batch Progress */}
        {isBatchRunning && batchProgress && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Processing: {batchProgress.currentName}</span>
              <span className="text-sm text-muted-foreground">
                {batchProgress.completed} / {batchProgress.total}
              </span>
            </div>
            <Progress value={(batchProgress.completed / batchProgress.total) * 100} className="h-2" />
            {batchProgress.errors > 0 && (
              <p className="text-sm text-destructive">{batchProgress.errors} error(s)</p>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={coverageFilter} onValueChange={(v) => setCoverageFilter(v as typeof coverageFilter)}>
            <SelectTrigger className="w-[160px]">
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
            <SelectTrigger className="w-[160px]">
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
            <SelectTrigger className="w-[120px]">
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
                <Button variant="default" disabled={isBatchRunning}>
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
                <Button variant="outline" disabled={isBatchRunning}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerate Low ({Math.min(lowCoverageCount, 50)})
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
        ) : candidates && candidates.length > 0 ? (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Office</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-center">Coverage</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.slice(0, 100).map((candidate) => {
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
                        <Badge className={getPartyColor(candidate.party)}>
                          {candidate.party}
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
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={candidate.answerCount === 0 ? 'default' : 'outline'}
                          disabled={loading || isBatchRunning}
                          onClick={() => populateCandidate(candidate.id, candidate.answerCount > 0)}
                        >
                          {loading ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              Generating...
                            </>
                          ) : candidate.answerCount === 0 ? (
                            <>
                              <Plus className="h-3 w-3 mr-1" />
                              Generate
                            </>
                          ) : (
                            <>
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Regenerate
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {candidates.length > 100 && (
              <div className="p-4 text-center text-sm text-muted-foreground border-t">
                Showing first 100 of {candidates.length} candidates. Use filters to narrow down.
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <p className="text-lg font-medium">All candidates covered!</p>
            <p className="text-muted-foreground">
              {coverageFilter === 'none' 
                ? 'No candidates without answers found.' 
                : coverageFilter === 'low'
                ? 'No candidates with low coverage found.'
                : 'No candidates match the current filters.'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
