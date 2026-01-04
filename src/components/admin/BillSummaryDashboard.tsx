import { useBillSummaryStats } from "@/hooks/useBillSummaryStats";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  FileText, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  XCircle,
  TrendingUp,
  BarChart3
} from "lucide-react";

export function BillSummaryDashboard() {
  const { data: stats, isLoading } = useBillSummaryStats();

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

        {/* Summary Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <div className="text-sm text-muted-foreground mb-1">Total Votes</div>
            <div className="text-2xl font-bold">{stats.totalVotes.toLocaleString()}</div>
          </div>
          
          <div className="bg-primary/10 rounded-lg p-4 text-center border border-primary/20">
            <div className="text-sm text-primary mb-1">Processable</div>
            <div className="text-2xl font-bold text-primary">{stats.processableVotes.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">can fetch summaries</div>
          </div>
          
          <div className="bg-green-500/10 rounded-lg p-4 text-center border border-green-500/20">
            <div className="flex items-center justify-center gap-1 text-sm text-green-600 mb-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              With Summary
            </div>
            <div className="text-2xl font-bold text-green-600">{stats.withSummary.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">{stats.coveragePct}% coverage</div>
          </div>
          
          <div className="bg-amber-500/10 rounded-lg p-4 text-center border border-amber-500/20">
            <div className="flex items-center justify-center gap-1 text-sm text-amber-600 mb-1">
              <XCircle className="h-3.5 w-3.5" />
              No Summary
            </div>
            <div className="text-2xl font-bold text-amber-600">{stats.noSummaryAvailable.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">bill has no CRS summary</div>
          </div>
          
          <div className="bg-blue-500/10 rounded-lg p-4 text-center border border-blue-500/20">
            <div className="flex items-center justify-center gap-1 text-sm text-blue-600 mb-1">
              <Clock className="h-3.5 w-3.5" />
              Pending
            </div>
            <div className="text-2xl font-bold text-blue-600">{stats.pending.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">ready to fetch</div>
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

        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Coverage of Processable Votes</span>
            <span className="font-medium">{stats.coveragePct}%</span>
          </div>
          <Progress value={stats.coveragePct} className="h-3" />
        </div>

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
