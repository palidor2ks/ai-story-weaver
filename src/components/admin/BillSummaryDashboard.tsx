import { useState } from "react";
import { useBillSummaryStats } from "@/hooks/useBillSummaryStats";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
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
  Download,
  Sparkles,
  Bot,
  Loader2,
  RefreshCw,
  Ban,
  Building2,
  Square
} from "lucide-react";
import { format } from "date-fns";

export function BillSummaryDashboard() {
  const { data: stats, isLoading, error } = useBillSummaryStats();
  const queryClient = useQueryClient();
  
  const [isFetchingCrs, setIsFetchingCrs] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isBackfillingChambers, setIsBackfillingChambers] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [chamberBackfillStats, setChamberBackfillStats] = useState<{
    updated: number;
    remaining: number | null;
    house: number;
    senate: number;
  } | null>(null);
  const [isAutoBackfilling, setIsAutoBackfilling] = useState(false);
  const [autoBackfillProgress, setAutoBackfillProgress] = useState<{
    totalProcessed: number;
    startingRemaining: number;
    currentRemaining: number;
  } | null>(null);
  // Use ref to allow stopping the loop from the stop button
  const stopAutoBackfillRef = { current: false };

  const handleRefreshStats = async () => {
    setIsRefreshing(true);
    const startTime = Date.now();
    const initialLastRefreshed = stats?.lastRefreshed;
    
    try {
      // Call edge function for background refresh
      const { error } = await supabase.functions.invoke('refresh-bill-summary-stats');
      if (error) throw error;
      
      toast.success('Refresh started', { description: 'Stats will update shortly...' });
      
      // Poll for completion (check every 5s, max 90s)
      const pollInterval = setInterval(async () => {
        await queryClient.invalidateQueries({ queryKey: ['bill-summary-stats'] });
        
        // Check if lastRefreshed has changed
        const currentStats = queryClient.getQueryData<{ lastRefreshed: string | null }>(['bill-summary-stats']);
        const elapsed = Date.now() - startTime;
        
        if (currentStats?.lastRefreshed !== initialLastRefreshed || elapsed > 90000) {
          clearInterval(pollInterval);
          setIsRefreshing(false);
          if (currentStats?.lastRefreshed !== initialLastRefreshed) {
            toast.success('Statistics refreshed');
          }
        }
      }, 5000);
      
      // Safety timeout
      setTimeout(() => {
        clearInterval(pollInterval);
        setIsRefreshing(false);
      }, 95000);
      
    } catch (err) {
      console.error('Error refreshing stats:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Failed to refresh statistics', { description: message });
      setIsRefreshing(false);
    }
  };

  const triggerBackgroundRefresh = async () => {
    try {
      await supabase.functions.invoke('refresh-bill-summary-stats');
    } catch (err) {
      console.error('Background refresh trigger failed:', err);
    }
  };

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
      
      // Trigger background refresh and invalidate query
      triggerBackgroundRefresh();
      await queryClient.invalidateQueries({ queryKey: ['bill-summary-stats'] });
    } catch (err) {
      toast.error('Failed to fetch CRS summaries', {
        description: err instanceof Error ? err.message : 'Unknown error'
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
      
      // Trigger background refresh and invalidate query
      triggerBackgroundRefresh();
      await queryClient.invalidateQueries({ queryKey: ['bill-summary-stats'] });
    } catch (err) {
      toast.error('Failed to generate AI summaries', {
        description: err instanceof Error ? err.message : 'Unknown error'
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Bill Summary Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error Loading Statistics</AlertTitle>
            <AlertDescription>
              Failed to load bill summary statistics. Please try refreshing the page.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  const isProcessing = isFetchingCrs || isGeneratingAi || isBackfillingChambers;

  const handleStopAutoBackfill = () => {
    stopAutoBackfillRef.current = true;
    toast.info('Stopping after current batch completes...');
  };

  const handleBackfillChambers = async (autoContinue: boolean = false) => {
    setIsBackfillingChambers(true);
    if (autoContinue) {
      setIsAutoBackfilling(true);
      stopAutoBackfillRef.current = false;
      setAutoBackfillProgress({ totalProcessed: 0, startingRemaining: 0, currentRemaining: 0 });
    }
    
    let totalProcessed = 0;
    let remaining = 1; // Start with non-zero to enter loop
    let isFirstRun = true;
    let startingRemaining = 0;
    
    try {
      while (remaining > 0 && (autoContinue ? !stopAutoBackfillRef.current : isFirstRun)) {
        const { data, error } = await supabase.functions.invoke('backfill-vote-chambers', {
          body: { batchSize: 50000 }
        });
        
        if (error) throw error;
        
        const batchUpdated = data?.updated || 0;
        remaining = data?.remaining || 0;
        
        if (isFirstRun && autoContinue) {
          startingRemaining = remaining + batchUpdated;
        }
        
        totalProcessed += batchUpdated;
        
        setChamberBackfillStats({
          updated: batchUpdated,
          remaining,
          house: data?.house || 0,
          senate: data?.senate || 0,
        });
        
        if (autoContinue && !stopAutoBackfillRef.current) {
          setAutoBackfillProgress({
            totalProcessed,
            startingRemaining: isFirstRun ? startingRemaining : (autoBackfillProgress?.startingRemaining || startingRemaining),
            currentRemaining: remaining,
          });
          
          // Show progress toast every batch
          toast.info(`Batch complete: ${batchUpdated.toLocaleString()} updated`, {
            description: `${remaining.toLocaleString()} remaining...`,
            duration: 2000,
          });
        }
        
        isFirstRun = false;
        
        // Small delay between batches to avoid rate limiting
        if (remaining > 0 && autoContinue && !stopAutoBackfillRef.current) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      if (remaining === 0) {
        toast.success('Chamber backfill complete!', {
          description: `All sponsored/cosponsored votes now have chamber values. Total processed: ${totalProcessed.toLocaleString()}`
        });
      } else if (stopAutoBackfillRef.current) {
        toast.success(`Auto-backfill stopped`, {
          description: `Processed ${totalProcessed.toLocaleString()} votes. ${remaining.toLocaleString()} remaining.`
        });
      } else if (!autoContinue) {
        toast.success(`Backfilled ${totalProcessed.toLocaleString()} votes`, {
          description: `${remaining.toLocaleString()} remaining. Click again or use "Auto".`
        });
      }
      
      // Refresh stats after backfill
      triggerBackgroundRefresh();
      await queryClient.invalidateQueries({ queryKey: ['bill-summary-stats'] });
    } catch (err) {
      toast.error('Failed to backfill chambers', {
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setIsBackfillingChambers(false);
      setIsAutoBackfilling(false);
      setAutoBackfillProgress(null);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Bill Summary Status Dashboard
            </CardTitle>
            <CardDescription>
              Detailed metrics on CRS bill summary coverage across voting records
              {stats.lastRefreshed && (
                <span className="ml-2 text-xs">
                  • Last updated: {format(new Date(stats.lastRefreshed), 'MMM d, h:mm a')}
                </span>
              )}
            </CardDescription>
          </div>
          
          {/* Action Buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button 
              variant="outline"
              size="sm"
              onClick={handleRefreshStats}
              disabled={isRefreshing || isProcessing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh Stats
            </Button>
            <Button 
              variant="outline"
              size="sm"
              onClick={handleFetchCrsSummaries}
              disabled={stats.notYetFetched === 0 || isProcessing}
            >
              {isFetchingCrs ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Fetch CRS ({stats.notYetFetched.toLocaleString()})
            </Button>
            <Button 
              size="sm"
              onClick={handleGenerateAiSummaries}
              disabled={stats.noSummaryAvailable === 0 || isProcessing}
            >
              {isGeneratingAi ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Generate AI ({stats.noSummaryAvailable.toLocaleString()})
          </Button>
          
          {/* Chamber Backfill Button Group */}
          <div className="flex gap-1">
            <Button 
              variant="outline"
              size="sm"
              onClick={() => handleBackfillChambers(false)}
              disabled={isProcessing}
            >
              {isBackfillingChambers && !isAutoBackfilling ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Building2 className="h-4 w-4 mr-2" />
              )}
              Backfill Chambers
              {chamberBackfillStats?.remaining != null && chamberBackfillStats.remaining > 0 && (
                <span className="ml-1 text-muted-foreground">
                  ({chamberBackfillStats.remaining.toLocaleString()})
                </span>
              )}
            </Button>
            
            {isAutoBackfilling ? (
              <Button 
                variant="destructive"
                size="sm"
                onClick={handleStopAutoBackfill}
              >
                <Square className="h-4 w-4 mr-2" />
                Stop
              </Button>
            ) : (
              <Button 
                variant="outline"
                size="sm"
                onClick={() => handleBackfillChambers(true)}
                disabled={isProcessing}
                title="Run continuously until all records are processed"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Auto
              </Button>
            )}
          </div>
        </div>
        </div>
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

        {/* Auto-Backfill Progress Bar */}
        {autoBackfillProgress && autoBackfillProgress.startingRemaining > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Auto-backfilling chambers...
              </span>
              <span className="font-medium">
                {autoBackfillProgress.totalProcessed.toLocaleString()} processed, {autoBackfillProgress.currentRemaining.toLocaleString()} remaining
              </span>
            </div>
            <Progress 
              value={((autoBackfillProgress.startingRemaining - autoBackfillProgress.currentRemaining) / autoBackfillProgress.startingRemaining) * 100} 
              className="h-2" 
            />
          </div>
        )}

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

        {/* Summary Statistics - 6-column Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <div className="text-sm text-muted-foreground mb-1">Total Votes</div>
            <div className="text-2xl font-bold">{stats.totalVotes.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">{stats.processableVotes.toLocaleString()} processable</div>
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
            <div className="text-2xl font-bold text-purple-600">
              {(stats.withAiSummary + stats.withAiProceduralSummary).toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">
              {stats.withAiProceduralSummary > 0 && `${stats.withAiProceduralSummary.toLocaleString()} procedural`}
              {stats.withAiProceduralSummary === 0 && 'AI-created summaries'}
            </div>
          </div>
          
          <div className="bg-muted/30 rounded-lg p-4 text-center border border-muted">
            <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground mb-1">
              <Ban className="h-3.5 w-3.5" />
              Not Applicable
            </div>
            <div className="text-2xl font-bold text-muted-foreground">
              {(stats.fullTextTitles + stats.unparseableBillIds).toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">unparseable IDs</div>
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
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              Pending: {(stats.notYetFetched + stats.noSummaryAvailable).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Not Processable Breakdown */}
        <div className="bg-muted/30 rounded-lg p-4 border border-muted">
          <div className="text-sm font-medium mb-3">Processing Details</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-lg font-bold text-purple-600">{stats.proceduralVotesPending.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Procedural Votes (pending AI)</div>
            </div>
            <div>
              <div className="text-lg font-bold text-amber-600">{stats.missingCongress.toLocaleString()}</div>
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
      </CardContent>
    </Card>
  );
}
