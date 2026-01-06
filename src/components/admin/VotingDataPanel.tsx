import { useState } from "react";
import { useVotingRecordsStats, useVotingRecordsSync } from "@/hooks/useVotingRecordsSync";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, RefreshCw, Database, FileText, Users, CheckCircle2, AlertTriangle, Hash, ChevronDown, Zap } from "lucide-react";
import { BillSummaryDashboard } from "./BillSummaryDashboard";
import { toast } from "sonner";

interface BackfillProgress {
  status: 'idle' | 'running' | 'complete' | 'error';
  updated: number;
  remaining: number;
  message?: string;
  rate?: number;
}

type BackfillSpeed = 'conservative' | 'normal' | 'fast';

export function VotingDataPanel() {
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useVotingRecordsStats();
  const { 
    syncAllVotes, 
    syncAllFloorVotes, 
    progress, 
    floorVoteProgress,
    issyncing,
    isFloorVoteSyncing 
  } = useVotingRecordsSync();

  const [congressBackfill, setCongressBackfill] = useState<BackfillProgress>({ 
    status: 'idle', updated: 0, remaining: 0 
  });
  const [summaryBackfill, setSummaryBackfill] = useState<BackfillProgress>({ 
    status: 'idle', updated: 0, remaining: 0 
  });
  const [missingCongressCount, setMissingCongressCount] = useState<number | null>(null);
  const [missingSummaryCount, setMissingSummaryCount] = useState<number | null>(null);
  const [summarySpeed, setSummarySpeed] = useState<BackfillSpeed>('normal');
  const [showDashboard, setShowDashboard] = useState(false);

  // Fetch missing counts on mount
  const fetchMissingCounts = async () => {
    const [congressResult, summaryResult] = await Promise.all([
      supabase
        .from('votes')
        .select('*', { count: 'exact', head: true })
        .is('congress', null),
      supabase
        .from('votes')
        .select('*', { count: 'exact', head: true })
        .is('bill_summary', null)
    ]);
    
    setMissingCongressCount(congressResult.count || 0);
    setMissingSummaryCount(summaryResult.count || 0);
  };

  // Initial fetch
  if (missingCongressCount === null && !statsLoading) {
    fetchMissingCounts();
  }

  const handleSyncMissingCandidates = async () => {
    try {
      toast.info("Starting sync for missing candidates...");
      await supabase.functions.invoke('sync-voting-records', {
        body: { mode: 'incremental' }
      });
      toast.success("Sync started. Check vote_sync_status table for progress.");
      refetchStats();
    } catch (error) {
      toast.error("Failed to start sync");
    }
  };

  const handleBackfillCongressNumbers = async () => {
    setCongressBackfill({ status: 'running', updated: 0, remaining: missingCongressCount || 0 });
    
    let totalUpdated = 0;
    let batchesWithNoUpdates = 0;
    const MAX_EMPTY_BATCHES = 3; // Stop after 3 consecutive batches with no updates
    
    try {
      while (true) {
        const { data, error } = await supabase.functions.invoke('backfill-vote-congress-numbers', {
          body: { batchSize: 1000 }
        });
        
        if (error) throw error;
        
        totalUpdated += data.updated || 0;
        
        // Use previous remaining if null returned (query failed)
        const remaining = data.remaining ?? congressBackfill.remaining;
        
        setCongressBackfill({
          status: 'running',
          updated: totalUpdated,
          remaining,
          message: data.message
        });
        
        // Exit condition 1: Server says complete
        if (data.status === 'complete') {
          setCongressBackfill(prev => ({ ...prev, status: 'complete' }));
          break;
        }
        
        // Exit condition 2: Multiple batches with no updates (truly done or all failing)
        if ((data.updated || 0) === 0) {
          batchesWithNoUpdates++;
          if (batchesWithNoUpdates >= MAX_EMPTY_BATCHES) {
            console.log('[Backfill] Stopping after multiple empty batches');
            setCongressBackfill(prev => ({ ...prev, status: 'complete' }));
            break;
          }
        } else {
          batchesWithNoUpdates = 0; // Reset counter on successful batch
        }
        
        // Small delay between batches
        await new Promise(r => setTimeout(r, 500));
      }
      
      toast.success(`Backfilled congress numbers for ${totalUpdated} votes`);
      fetchMissingCounts();
      refetchStats();
    } catch (error) {
      setCongressBackfill(prev => ({ ...prev, status: 'error', message: String(error) }));
      toast.error("Failed to backfill congress numbers");
    }
  };

  const handleBackfillSummaries = async () => {
    setSummaryBackfill({ status: 'running', updated: 0, remaining: missingSummaryCount || 0 });
    
    let totalUpdated = 0;
    let batchesWithNoUpdates = 0;
    const MAX_EMPTY_BATCHES = 3;
    const batchSize = summarySpeed === 'fast' ? 50 : summarySpeed === 'conservative' ? 30 : 50;
    
    try {
      while (true) {
        const { data, error } = await supabase.functions.invoke('backfill-bill-summaries', {
          body: { batchSize, speed: summarySpeed }
        });
        
        if (error) throw error;
        
        totalUpdated += data.updated || 0;
        
        // Update UI - remaining may be null (unknown)
        setSummaryBackfill({
          status: 'running',
          updated: totalUpdated,
          remaining: data.remaining ?? -1,
          message: `${data.processingRate?.toFixed(1) || '?'}/sec`,
          rate: data.processingRate
        });
        
        // Exit condition 1: Server says complete (no rows found)
        if (data.status === 'complete') {
          setSummaryBackfill(prev => ({ ...prev, status: 'complete', remaining: 0 }));
          break;
        }
        
        // Exit condition 2: Multiple batches with no updates
        if ((data.updated || 0) === 0) {
          batchesWithNoUpdates++;
          if (batchesWithNoUpdates >= MAX_EMPTY_BATCHES) {
            console.log('[Backfill] Stopping after multiple empty batches');
            setSummaryBackfill(prev => ({ ...prev, status: 'complete' }));
            break;
          }
        } else {
          batchesWithNoUpdates = 0;
        }
        
        // Minimal delay - rate limiting handled in edge function
        await new Promise(r => setTimeout(r, 300));
      }
      
      toast.success(`Backfilled ${totalUpdated} bill summaries`);
      fetchMissingCounts();
    } catch (error) {
      setSummaryBackfill(prev => ({ ...prev, status: 'error', message: String(error) }));
      toast.error("Failed to backfill bill summaries");
    }
  };

  const handleSyncAllVotes = async () => {
    try {
      await syncAllVotes.mutateAsync();
      toast.success("Vote sync completed");
    } catch (error) {
      toast.error("Vote sync failed");
    }
  };

  const handleSyncAllFloorVotes = async () => {
    try {
      await syncAllFloorVotes.mutateAsync();
      toast.success("Floor vote sync completed");
    } catch (error) {
      toast.error("Floor vote sync failed");
    }
  };

  if (statsLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const candidateCoverage = stats ? Math.round((stats.membersWithVotes / stats.totalFederalLegislators) * 100) : 0;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Voting Data Management
        </CardTitle>
        <CardDescription>
          Sync and backfill voting records for federal legislators
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="text-sm text-muted-foreground">Total Votes</div>
            <div className="text-2xl font-bold">{stats?.totalVotes?.toLocaleString() || 0}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="text-sm text-muted-foreground">Legislative Actions</div>
            <div className="text-2xl font-bold">{stats?.totalLegislativeActions?.toLocaleString() || 0}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="text-sm text-muted-foreground">Floor Votes</div>
            <div className="text-2xl font-bold">{stats?.totalFloorVotes?.toLocaleString() || 0}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="text-sm text-muted-foreground">Candidate Coverage</div>
            <div className="text-2xl font-bold">
              {stats?.membersWithVotes || 0}/{stats?.totalFederalLegislators || 0}
              <span className="text-sm font-normal text-muted-foreground ml-1">({candidateCoverage}%)</span>
            </div>
          </div>
        </div>

        {/* Data Quality Indicators */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4" />
                <span className="font-medium">Missing Congress Numbers</span>
              </div>
              <Badge variant={missingCongressCount === 0 ? "default" : "destructive"}>
                {missingCongressCount?.toLocaleString() || '?'}
              </Badge>
            </div>
            {congressBackfill.status === 'running' && (
              <div className="space-y-2 mt-3">
                <Progress 
                  value={((congressBackfill.updated) / (congressBackfill.updated + congressBackfill.remaining)) * 100} 
                />
                <div className="text-xs text-muted-foreground">
                  Updated {congressBackfill.updated.toLocaleString()}, {congressBackfill.remaining.toLocaleString()} remaining
                </div>
              </div>
            )}
          </div>
          
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span className="font-medium">Missing Bill Summaries</span>
              </div>
              <Badge variant={missingSummaryCount === 0 ? "default" : "secondary"}>
                {missingSummaryCount?.toLocaleString() || '?'}
              </Badge>
            </div>
            {summaryBackfill.status === 'running' && (
              <div className="space-y-2 mt-3">
                <Progress 
                  value={missingSummaryCount && missingSummaryCount > 0 
                    ? (summaryBackfill.updated / missingSummaryCount) * 100 
                    : undefined} 
                />
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <span>
                    Updated {summaryBackfill.updated.toLocaleString()}
                    {missingSummaryCount && missingSummaryCount > 0 && (
                      <span className="text-muted-foreground/60"> of ~{missingSummaryCount.toLocaleString()}</span>
                    )}
                  </span>
                  {summaryBackfill.rate && (
                    <Badge variant="outline" className="text-xs">
                      <Zap className="h-3 w-3 mr-1" />
                      {summaryBackfill.rate.toFixed(1)}/sec
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Button 
            variant="outline" 
            onClick={handleSyncMissingCandidates}
            disabled={issyncing}
          >
            <Users className="h-4 w-4 mr-2" />
            Sync Missing Candidates
          </Button>
          
          <Button 
            variant="outline" 
            onClick={handleBackfillCongressNumbers}
            disabled={congressBackfill.status === 'running'}
          >
            {congressBackfill.status === 'running' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : missingCongressCount === 0 ? (
              <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
            ) : (
              <Hash className="h-4 w-4 mr-2" />
            )}
            {congressBackfill.status === 'complete' && missingCongressCount && missingCongressCount > 0 
              ? `Resume (${missingCongressCount.toLocaleString()})` 
              : 'Backfill Congress #s'}
          </Button>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={handleBackfillSummaries}
              disabled={summaryBackfill.status === 'running'}
              className="flex-1"
            >
              {summaryBackfill.status === 'running' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              Backfill Summaries
            </Button>
            <select 
              value={summarySpeed}
              onChange={(e) => setSummarySpeed(e.target.value as BackfillSpeed)}
              disabled={summaryBackfill.status === 'running'}
              className="border rounded px-2 py-1 text-sm bg-background"
            >
              <option value="conservative">Slow</option>
              <option value="normal">Normal</option>
              <option value="fast">Fast</option>
            </select>
          </div>
          
          <Button 
            variant="outline"
            onClick={() => refetchStats()}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Stats
          </Button>
        </div>

        {/* Sync All Votes Section */}
        <div className="border-t pt-4 space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Full Sync Operations (Time Intensive)
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Button 
                onClick={handleSyncAllVotes}
                disabled={issyncing}
                className="w-full"
              >
                {issyncing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sync All Sponsored/Cosponsored
              </Button>
              {progress && (
                <div className="space-y-1">
                  <Progress value={(progress.completed / progress.total) * 100} />
                  <div className="text-xs text-muted-foreground">
                    {progress.completed}/{progress.total} members
                    {progress.current && ` • ${progress.current}`}
                    {progress.errors.length > 0 && ` • ${progress.errors.length} errors`}
                  </div>
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <Button 
                onClick={handleSyncAllFloorVotes}
                disabled={isFloorVoteSyncing}
                className="w-full"
              >
                {isFloorVoteSyncing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sync All Floor Votes
              </Button>
              {floorVoteProgress && (
                <div className="space-y-1">
                  <Progress value={(floorVoteProgress.completed / floorVoteProgress.total) * 100} />
                  <div className="text-xs text-muted-foreground">
                    {floorVoteProgress.completed}/{floorVoteProgress.total} members
                    {floorVoteProgress.current && ` • ${floorVoteProgress.current}`}
                    {floorVoteProgress.errors.length > 0 && ` • ${floorVoteProgress.errors.length} errors`}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Bill Summary Dashboard Toggle */}
        <Collapsible open={showDashboard} onOpenChange={setShowDashboard}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Bill Summary Dashboard
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showDashboard ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4">
            <BillSummaryDashboard />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
