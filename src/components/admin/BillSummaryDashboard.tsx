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
  Database
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";

export function BillSummaryDashboard() {
  const { data: stats, isLoading, error } = useBillSummaryStats();
  const queryClient = useQueryClient();
  
  const [isFetchingCrs, setIsFetchingCrs] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [selectedCongress, setSelectedCongress] = useState<string>("119");
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const CONGRESS_OPTIONS = [
    { value: "119", label: "119th (2025-2026)" },
    { value: "118", label: "118th (2023-2024)" },
    { value: "117", label: "117th (2021-2022)" },
    { value: "116", label: "116th (2019-2020)" },
    { value: "115", label: "115th (2017-2018)" },
    { value: "114", label: "114th (2015-2016)" },
    { value: "113", label: "113th (2013-2014)" },
    { value: "112", label: "112th (2011-2012)" },
    { value: "111", label: "111th (2009-2010)" },
  ];

  const handleRefreshStats = async () => {
    setIsRefreshing(true);
    const startTime = Date.now();
    const initialLastRefreshed = stats?.lastRefreshed;
    
    try {
      const { error } = await supabase.functions.invoke('refresh-bill-summary-stats');
      if (error) throw error;
      
      toast.success('Refresh started', { description: 'Stats will update shortly...' });
      
      const pollInterval = setInterval(async () => {
        await queryClient.invalidateQueries({ queryKey: ['bill-summary-stats'] });
        
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
    setProgress({ current: 0, total: stats?.pendingFetch || 0 });
    
    try {
      const { data, error } = await supabase.functions.invoke('backfill-bill-summaries', {
        body: { batchSize: 50 }
      });
      
      if (error) throw error;
      
      toast.success(`Fetched CRS summaries`, {
        description: `Updated ${data?.updated || 0} bills`
      });
      
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

  const handleIngestBills = async () => {
    setIsIngesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-all-bills', {
        body: { congress: parseInt(selectedCongress), limit: 250 }
      });
      
      if (error) throw error;
      
      toast.success(`Ingested bills from ${selectedCongress}th Congress`, {
        description: `Inserted/updated ${data?.inserted || 0} bills`
      });
      
      triggerBackgroundRefresh();
      await queryClient.invalidateQueries({ queryKey: ['bill-summary-stats'] });
    } catch (err) {
      console.error('Error ingesting bills:', err);
      toast.error('Failed to ingest bills', {
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setIsIngesting(false);
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

  const isProcessing = isFetchingCrs || isGeneratingAi || isIngesting;

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
              Metrics on CRS bill summary coverage across the bills table
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
              disabled={stats.pendingFetch === 0 || isProcessing}
            >
              {isFetchingCrs ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Fetch CRS ({stats.pendingFetch.toLocaleString()})
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
            
            <div className="h-6 w-px bg-border" />
            
            <Select value={selectedCongress} onValueChange={setSelectedCongress}>
              <SelectTrigger className="w-[160px] h-8">
                <SelectValue placeholder="Select Congress" />
              </SelectTrigger>
              <SelectContent>
                {CONGRESS_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button 
              variant="secondary"
              size="sm"
              onClick={handleIngestBills}
              disabled={isProcessing}
            >
              {isIngesting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Database className="h-4 w-4 mr-2" />
              )}
              Ingest Bills
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
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
            <div className="text-sm text-muted-foreground mb-1">Total Bills</div>
            <div className="text-2xl font-bold">{stats.totalBills.toLocaleString()}</div>
          </div>
          
          <div className="bg-blue-500/10 rounded-lg p-4 text-center border border-blue-500/20">
            <div className="flex items-center justify-center gap-1 text-sm text-blue-600 mb-1">
              <Clock className="h-3.5 w-3.5" />
              Pending Fetch
            </div>
            <div className="text-2xl font-bold text-blue-600">{stats.pendingFetch.toLocaleString()}</div>
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
              Flagged
            </div>
            <div className="text-2xl font-bold text-muted-foreground">
              {stats.flaggedCount.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">needs review</div>
          </div>
        </div>

        {/* Total Coverage */}
        <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">Total Summary Coverage</span>
            <Badge variant="outline" className="text-primary">
              {stats.withSummary.toLocaleString()} / {stats.totalBills.toLocaleString()} ({stats.coveragePct}%)
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
              Pending: {(stats.pendingFetch + stats.noSummaryAvailable).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Congress Breakdown */}
        <div className="bg-muted/30 rounded-lg p-4 border border-muted">
          <div className="text-sm font-medium mb-3">Congress Breakdown</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-lg font-bold text-primary">{stats.congress118Count.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">118th Congress</div>
            </div>
            <div>
              <div className="text-lg font-bold text-primary">{stats.congress119Count.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">119th Congress</div>
            </div>
            <div>
              <div className="text-lg font-bold text-amber-600">{stats.mismatchCount.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Topic Mismatches</div>
            </div>
            <div>
              <div className="text-lg font-bold text-muted-foreground">{stats.omnibusCount.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Omnibus Bills</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
