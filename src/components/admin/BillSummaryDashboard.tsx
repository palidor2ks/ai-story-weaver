import { useState } from "react";
import { useBillSummaryStats } from "@/hooks/useBillSummaryStats";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { 
  FileText, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  XCircle,
  TrendingUp,
  BarChart3,
  Download,
  Sparkles,
  Bot,
  Loader2
} from "lucide-react";

export function BillSummaryDashboard() {
  const { data: stats, isLoading } = useBillSummaryStats();
  const queryClient = useQueryClient();
  
  const [isFetchingCrs, setIsFetchingCrs] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const handleFetchCrsSummaries = async () => {
    setIsFetchingCrs(true);
    setProgress({ current: 0, total: stats?.notYetFetched || 0 });
    
    try {
      const { data, error } = await supabase.functions.invoke('backfill-bill-summaries', {
        body: { batchSize: 50 }
      });
      
      if (error) throw error;
      
      toast.success(`Fetched CRS summaries`, {
        description: `Updated ${data?.updated || 0} votes, ${data?.noSummary || 0} had no CRS summary`
      });
      
      queryClient.invalidateQueries({ queryKey: ['bill-summary-stats'] });
    } catch (error) {
      toast.error('Failed to fetch CRS summaries', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsFetchingCrs(false);
      setProgress(null);
    }
  };

  const handleGenerateAiSummaries = async () => {
    setIsGeneratingAi(true);
    setProgress({ current: 0, total: stats?.noSummaryAvailable || 0 });
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-ai-bill-summaries', {
        body: { batchSize: 10 }
      });
      
      if (error) throw error;
      
      toast.success(`Generated AI summaries`, {
        description: `Processed ${data?.processed || 0} bills, ${data?.failed || 0} failed`
      });
      
      queryClient.invalidateQueries({ queryKey: ['bill-summary-stats'] });
    } catch (error) {
      toast.error('Failed to generate AI summaries', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsGeneratingAi(false);
      setProgress(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Bill Summary Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  const getCongressYears = (congress: number) => {
    const startYear = 1789 + (congress - 1) * 2;
    return `${startYear}-${startYear + 1}`;
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Bill Summary Status Dashboard
        </CardTitle>
        <CardDescription>
          Detailed metrics on CRS bill summary coverage across voting records
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Data Quality Warning */}
        {stats.missingCongress > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Congress Number Required</AlertTitle>
            <AlertDescription>
              {stats.missingCongress.toLocaleString()} votes are missing congress numbers. 
              Run the "Backfill Congress #s" operation first — summaries cannot be fetched without congress numbers.
            </AlertDescription>
          </Alert>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4 flex-wrap">
          <Button 
            onClick={handleFetchCrsSummaries}
            disabled={stats.notYetFetched === 0 || isFetchingCrs || isGeneratingAi}
            className="gap-2"
          >
            {isFetchingCrs ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Fetch CRS Summaries ({stats.notYetFetched.toLocaleString()} pending)
          </Button>
          
          <Button 
            variant="secondary"
            onClick={handleGenerateAiSummaries}
            disabled={stats.noSummaryAvailable === 0 || isFetchingCrs || isGeneratingAi}
            className="gap-2"
          >
            {isGeneratingAi ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate AI Summaries ({stats.noSummaryAvailable.toLocaleString()} bills)
          </Button>
        </div>

        {/* Progress Bar */}
        {progress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {isFetchingCrs ? 'Fetching CRS summaries...' : 'Generating AI summaries...'}
              </span>
              <span className="font-medium">{progress.current} / {progress.total}</span>
            </div>
            <Progress value={(progress.current / progress.total) * 100} className="h-2" />
          </div>
        )}

        {/* Summary Statistics - Updated Layout */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <div className="text-sm text-muted-foreground mb-1">Total Votes</div>
            <div className="text-2xl font-bold">{stats.totalVotes.toLocaleString()}</div>
          </div>
          
          <div className="bg-blue-500/10 rounded-lg p-4 text-center border border-blue-500/20">
            <div className="flex items-center justify-center gap-1 text-sm text-blue-600 mb-1">
              <Clock className="h-3.5 w-3.5" />
              Not Yet Fetched
            </div>
            <div className="text-2xl font-bold text-blue-600">{stats.notYetFetched.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">needs CRS fetch</div>
          </div>
          
          <div className="bg-green-500/10 rounded-lg p-4 text-center border border-green-500/20">
            <div className="flex items-center justify-center gap-1 text-sm text-green-600 mb-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              CRS Summary
            </div>
            <div className="text-2xl font-bold text-green-600">{stats.withCrsSummary.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">official summaries</div>
          </div>
          
          <div className="bg-amber-500/10 rounded-lg p-4 text-center border border-amber-500/20">
            <div className="flex items-center justify-center gap-1 text-sm text-amber-600 mb-1">
              <XCircle className="h-3.5 w-3.5" />
              No CRS Summary
            </div>
            <div className="text-2xl font-bold text-amber-600">{stats.noSummaryAvailable.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">needs AI generation</div>
          </div>

          <div className="bg-purple-500/10 rounded-lg p-4 text-center border border-purple-500/20">
            <div className="flex items-center justify-center gap-1 text-sm text-purple-600 mb-1">
              <Bot className="h-3.5 w-3.5" />
              AI Generated
            </div>
            <div className="text-2xl font-bold text-purple-600">{stats.withAiSummary.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">AI-created summaries</div>
          </div>
          
          <div className="bg-muted/30 rounded-lg p-4 text-center border border-muted">
            <div className="text-sm text-muted-foreground mb-1">Not Applicable</div>
            <div className="text-2xl font-bold text-muted-foreground">
              {(stats.floorVotesNoBill + stats.fullTextTitles + stats.unparseableBillIds).toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">floor votes, etc.</div>
          </div>
        </div>

        {/* Total Coverage */}
        <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">Total Summary Coverage</span>
            <Badge variant="outline" className="text-primary">
              {stats.withSummary.toLocaleString()} / {stats.processableVotes.toLocaleString()} ({stats.coveragePct}%)
            </Badge>
          </div>
          <Progress value={stats.coveragePct} className="h-3" />
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              CRS: {stats.withCrsSummary.toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-purple-500" />
              AI: {stats.withAiSummary.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Not Processable Breakdown */}
        <div className="bg-muted/30 rounded-lg p-4 border border-muted">
          <div className="text-sm font-medium mb-3">Not Processable (excluded from backfill)</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-lg font-bold text-muted-foreground">{stats.floorVotesNoBill.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Floor Votes (VOTE-xxx)</div>
            </div>
            <div>
              <div className="text-lg font-bold text-muted-foreground">{stats.missingCongress.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Missing Congress #</div>
            </div>
            <div>
              <div className="text-lg font-bold text-muted-foreground">{stats.fullTextTitles.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Full-Text Titles</div>
            </div>
            <div>
              <div className="text-lg font-bold text-muted-foreground">{stats.unparseableBillIds.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Unparseable IDs</div>
            </div>
          </div>
        </div>
        
        {/* Missing Congress Warning */}
        {stats.missingCongress > 0 && (
          <div className="bg-destructive/10 rounded-lg p-4 border border-destructive/20">
            <div className="flex items-center gap-2 text-destructive mb-1">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">{stats.missingCongress.toLocaleString()} votes blocked — missing congress number</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Run "Backfill Congress #s" first to unblock these votes for summary fetching.
            </p>
          </div>
        )}

        {/* Coverage by Congress */}
        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Coverage by Congress
          </h4>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Congress</TableHead>
                  <TableHead>Years</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">With Summary</TableHead>
                  <TableHead className="text-right">No Summary</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="w-32">Coverage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.byCongress.slice(0, 10).map(row => (
                  <TableRow key={row.congress}>
                    <TableCell className="font-medium">{row.congress}th</TableCell>
                    <TableCell className="text-muted-foreground">{getCongressYears(row.congress)}</TableCell>
                    <TableCell className="text-right">{row.total_votes.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-green-600">{row.with_summary.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-amber-600">{row.no_summary_available.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-blue-600">{row.pending.toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={row.coverage_pct} className="h-2 flex-1" />
                        <span className="text-xs w-8">{row.coverage_pct}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Coverage by Action Type */}
        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Coverage by Action Type
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {stats.byActionType.map(row => (
              <div key={row.action_type} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className="capitalize">
                    {row.action_type.replace('_', ' ')}
                  </Badge>
                  <span className="text-sm font-medium">{row.coverage_pct}%</span>
                </div>
                <Progress value={row.coverage_pct} className="h-2 mb-2" />
                <div className="text-xs text-muted-foreground">
                  {row.with_summary.toLocaleString()} / {row.total_votes.toLocaleString()} votes
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Candidates by Vote Count */}
        <div className="space-y-3">
          <h4 className="font-medium">Top Candidates by Vote Count</h4>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Office</TableHead>
                  <TableHead className="text-right">Total Votes</TableHead>
                  <TableHead className="text-right">With Summary</TableHead>
                  <TableHead className="w-32">Coverage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.topCandidates.slice(0, 10).map(row => (
                  <TableRow key={row.candidate_id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      <Badge variant={row.party === 'Democrat' ? 'default' : row.party === 'Republican' ? 'destructive' : 'secondary'}>
                        {row.party}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.office}</TableCell>
                    <TableCell className="text-right">{row.total_votes.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-green-600">{row.with_summary.toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={row.coverage_pct} className="h-2 flex-1" />
                        <span className="text-xs w-8">{row.coverage_pct}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
