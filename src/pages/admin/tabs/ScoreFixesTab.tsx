import { useState } from "react";
import { Link } from "react-router-dom";
import { useInvertedScoreCandidates, useRegenerateCandidateAnswers, useBatchRegenerateCandidates } from "@/hooks/useInvertedScoreCandidates";
import { ScoreTextInline } from "@/components/ScoreText";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";

const getPartyColor = (party: string) => {
  switch (party) {
    case 'Democrat': return 'bg-flag-blue text-white';
    case 'Republican': return 'bg-flag-red text-white';
    case 'Independent': return 'bg-purple-600 text-white';
    default: return 'bg-muted text-muted-foreground';
  }
};

export function ScoreFixesTab() {
  const { data: invertedCandidates, isLoading: invertedLoading } = useInvertedScoreCandidates();
  const regenerateMutation = useRegenerateCandidateAnswers();
  const batchRegenerateMutation = useBatchRegenerateCandidates();
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set());

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Candidates with Inverted Scores
        </CardTitle>
        <CardDescription>
          These candidates have scores that don't match their party alignment. 
          Democrats/Independents should have negative scores (left-leaning), 
          Republicans should have positive scores (right-leaning).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {invertedLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : invertedCandidates && invertedCandidates.length > 0 ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Found {invertedCandidates.length} candidate(s) with likely inverted scores
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="default"
                    disabled={batchRegenerateMutation.isPending}
                  >
                    {batchRegenerateMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Regenerating All...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Fix All ({invertedCandidates.length})
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Regenerate All Inverted Scores?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will regenerate answers for {invertedCandidates.length} candidates 
                      using the corrected scoring prompt. This may take several minutes.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={() => batchRegenerateMutation.mutate(invertedCandidates.map(c => c.candidate_id))}
                    >
                      Regenerate All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Party</TableHead>
                    <TableHead>Office</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead className="text-center">Current Score</TableHead>
                    <TableHead className="text-center">Answers</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invertedCandidates.map((candidate) => {
                    const isRegenerating = regeneratingIds.has(candidate.candidate_id) || 
                      regenerateMutation.isPending && regenerateMutation.variables === candidate.candidate_id;
                    
                    return (
                      <TableRow key={candidate.candidate_id}>
                        <TableCell className="font-medium">
                          <Link 
                            to={`/candidate/${candidate.candidate_id}`}
                            className="hover:underline text-primary"
                          >
                            {candidate.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge className={getPartyColor(candidate.party)}>
                            {candidate.party}
                          </Badge>
                        </TableCell>
                        <TableCell>{candidate.office}</TableCell>
                        <TableCell>{candidate.state}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <ScoreTextInline score={candidate.calculated_score} />
                            <span className="text-xs text-destructive">
                              (should be {candidate.party === 'Republican' ? 'positive' : 'negative'})
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{candidate.answer_count}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isRegenerating || batchRegenerateMutation.isPending}
                            onClick={async () => {
                              setRegeneratingIds(prev => new Set(prev).add(candidate.candidate_id));
                              try {
                                await regenerateMutation.mutateAsync(candidate.candidate_id);
                              } finally {
                                setRegeneratingIds(prev => {
                                  const next = new Set(prev);
                                  next.delete(candidate.candidate_id);
                                  return next;
                                });
                              }
                            }}
                          >
                            {isRegenerating ? (
                              <>
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Fixing...
                              </>
                            ) : (
                              <>
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Fix Score
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="text-center py-12">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <p className="text-lg font-medium">All scores look correct!</p>
            <p className="text-muted-foreground">
              No candidates found with inverted political scores.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
