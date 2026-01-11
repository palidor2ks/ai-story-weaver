import { useState, useMemo } from "react";
import { useBillSummaryStats, IngestionStatus } from "@/hooks/useBillSummaryStats";
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
  Database,
  Wand2,
  Users,
  CalendarSync,
  Gavel,
  Scale,
  Send,
  XOctagon,
  Landmark,
  PlayCircle,
  RotateCcw,
  AlertCircle,
  Upload,
  Tags
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export function BillSummaryDashboard() {
  const [selectedCongress, setSelectedCongress] = useState<string>("119");
  const [includeResolutions, setIncludeResolutions] = useState(true);
  
  // Pass selected congress and resolution filter to hook
  const { data: stats, isLoading, error } = useBillSummaryStats(parseInt(selectedCongress), includeResolutions);
  const queryClient = useQueryClient();
  
  const [isFetchingCrs, setIsFetchingCrs] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFetchingBioguides, setIsFetchingBioguides] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDerivingTopics, setIsDerivingTopics] = useState(false);
  // selectedCongress is now declared at the top before useBillSummaryStats
  const [progress, setProgress] = useState<{ 
    current: number; 
    total: number; 
    filtered?: number;
    inserted?: number;
    checked?: number;
  } | null>(null);

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

  // Get ingestion status for selected congress
  const selectedIngestionStatus = useMemo(() => {
    if (!stats?.ingestionStatuses) return null;
    return stats.ingestionStatuses.find(s => s.congress === parseInt(selectedCongress)) || null;
  }, [stats?.ingestionStatuses, selectedCongress]);

  const isIncomplete = selectedIngestionStatus?.status === 'in_progress';
  const isFailed = selectedIngestionStatus?.status === 'failed';

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
    setProgress({ current: 0, total: stats?.needsAiGeneration || 0 });
    
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
    
    // Check for existing incomplete ingestion
    const existingStatus = selectedIngestionStatus;
    const isResuming = existingStatus?.status === 'in_progress';
    
    let offset = isResuming ? existingStatus.lastOffset : 0;
    let totalInserted = isResuming ? existingStatus.totalInserted : 0;
    let totalFiltered = isResuming ? existingStatus.totalFiltered : 0;
    let hasMore = true;
    let estimatedTotal = existingStatus?.totalAvailable || 0;
    
    if (isResuming) {
      toast.info('Resuming ingestion...', {
        description: `Continuing from offset ${offset.toLocaleString()} (${totalInserted.toLocaleString()} already inserted)`
      });
    }
    
    try {
      while (hasMore) {
        const { data, error } = await supabase.functions.invoke('fetch-all-bills', {
          body: { 
            congress: parseInt(selectedCongress), 
            limit: 250,
            offset,
            excludeIntroduced: true  // Only import bills that passed at least one chamber
          }
        });
        
        if (error) throw error;
        
        totalInserted = data?.runningTotals?.inserted || totalInserted + (data?.inserted || 0);
        totalFiltered = data?.runningTotals?.filtered || totalFiltered + (data?.filtered || 0);
        hasMore = data?.hasMore || false;
        offset = data?.nextOffset || offset + 250;
        
        // Get estimated total from first response
        if (estimatedTotal === 0 && data?.totalCount) {
          estimatedTotal = data.totalCount;
        }
        
        // Update progress UI - show checked (inserted + filtered) vs total
        const totalChecked = totalInserted + totalFiltered;
        setProgress({ 
          current: totalInserted,  // Keep for backward compat with other operations
          total: estimatedTotal || totalChecked,
          filtered: totalFiltered,
          inserted: totalInserted,
          checked: totalChecked
        });
        
        // Rate limiting delay between batches
        if (hasMore) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      
      toast.success(`Ingested all bills from ${selectedCongress}th Congress`, {
        description: `Total: ${totalInserted.toLocaleString()} bills (${totalFiltered.toLocaleString()} filtered)`
      });
      
      triggerBackgroundRefresh();
      await queryClient.invalidateQueries({ queryKey: ['bill-summary-stats'] });
    } catch (err) {
      console.error('Error ingesting bills:', err);
      toast.error('Ingestion interrupted', {
        description: `${err instanceof Error ? err.message : 'Unknown error'}. Click "Ingest Bills" to resume.`
      });
    } finally {
      setIsIngesting(false);
      setProgress(null);
      // Refresh to get latest ingestion status
      await queryClient.invalidateQueries({ queryKey: ['bill-summary-stats'] });
    }
  };

  const handleResetIngestion = async () => {
    if (!confirm(`Reset ingestion progress for the ${selectedCongress}th Congress? This will start fresh on next ingest.`)) {
      return;
    }
    
    setIsResetting(true);
    try {
      const { error } = await supabase
        .from('bill_ingestion_status')
        .delete()
        .eq('congress', parseInt(selectedCongress));
      
      if (error) throw error;
      
      toast.success(`Reset ingestion for ${selectedCongress}th Congress`);
      await queryClient.invalidateQueries({ queryKey: ['bill-summary-stats'] });
    } catch (err) {
      console.error('Error resetting ingestion:', err);
      toast.error('Failed to reset ingestion', {
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setIsResetting(false);
    }
  };

  const handleNightlySync = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('nightly-bill-sync', {
        body: { congress: parseInt(selectedCongress) }
      });
      
      if (error) throw error;
      
      toast.success('Bill sync completed', {
        description: `Checked: ${data?.billsChecked || 0}, Updated: ${data?.billsUpdated || 0}, New: ${data?.newBillsAdded || 0}${data?.skippedIntroduced ? `, Skipped: ${data.skippedIntroduced}` : ''}`
      });
      
      triggerBackgroundRefresh();
      await queryClient.invalidateQueries({ queryKey: ['bill-summary-stats'] });
    } catch (err) {
      console.error('Error syncing bills:', err);
      toast.error('Failed to sync bills', {
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleFetchBioguideIds = async () => {
    setIsFetchingBioguides(true);
    setProgress({ current: 0, total: stats?.billsMissingSponsor || 0 });
    
    try {
      let totalProcessed = 0;
      let totalCosponsors = 0;
      let remaining = stats?.billsMissingSponsor || 0;
      
      // Process in batches until done or limit reached
      while (remaining > 0 && totalProcessed < 500) {
        const { data, error } = await supabase.functions.invoke('fetch-bioguide-ids', {
          body: { batchSize: 50, congress: parseInt(selectedCongress) }
        });
        
        if (error) throw error;
        
        totalProcessed += data?.processed || 0;
        totalCosponsors += data?.cosponsorsAdded || 0;
        remaining = data?.remaining || 0;
        
        setProgress({ current: totalProcessed, total: stats?.billsMissingSponsor || 0 });
        
        if ((data?.processed || 0) === 0) break;
        
        // Rate limit between batches
        await new Promise(r => setTimeout(r, 500));
      }
      
      toast.success('Bioguide ID fetch completed', {
        description: `Linked ${totalProcessed.toLocaleString()} sponsors, ${totalCosponsors.toLocaleString()} cosponsors`
      });
      
      triggerBackgroundRefresh();
      await queryClient.invalidateQueries({ queryKey: ['bill-summary-stats'] });
    } catch (err) {
      console.error('Error fetching bioguide IDs:', err);
      toast.error('Failed to fetch bioguide IDs', {
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setIsFetchingBioguides(false);
      setProgress(null);
    }
  };

  const handleClearBills = async () => {
    if (!confirm(`Are you sure you want to delete all bills from the ${selectedCongress}th Congress? This cannot be undone.`)) {
      return;
    }
    
    setIsClearing(true);
    try {
      const { data, error } = await supabase.functions.invoke('clear-congress-bills', {
        body: { congress: parseInt(selectedCongress) }
      });
      
      if (error) throw error;
      
      // Also clear ingestion status
      await supabase
        .from('bill_ingestion_status')
        .delete()
        .eq('congress', parseInt(selectedCongress));
      
      toast.success(`Cleared ${selectedCongress}th Congress bills`, {
        description: `Deleted ${data?.deleted?.toLocaleString() || 0} bills`
      });
      
      triggerBackgroundRefresh();
      await queryClient.invalidateQueries({ queryKey: ['bill-summary-stats'] });
    } catch (err) {
      console.error('Error clearing bills:', err);
      toast.error('Failed to clear bills', {
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setIsClearing(false);
    }
  };

  // Handler for importing bills from Excel file with client-side batching
  // to avoid WORKER_LIMIT errors on large files
  const handleImportExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsImporting(true);
    setProgress({ current: 0, total: 100 });
    
    try {
      toast.info("Reading Excel file...");
      
      // Read the file
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      // Get the second sheet (index 1) which contains the data
      // The first sheet is a summary/pivot table
      const sheetName = workbook.SheetNames[1] || workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });
      
      console.log(`[ImportExcel] Parsed ${jsonData.length} rows from sheet "${sheetName}"`);
      
      if (jsonData.length === 0) {
        throw new Error('No data found in Excel file');
      }
      
      // Batch processing - 500 rows per batch to avoid memory limits
      const BATCH_SIZE = 500;
      const totalBatches = Math.ceil(jsonData.length / BATCH_SIZE);
      let totalInserted = 0;
      let totalErrors = 0;
      const allErrors: string[] = [];
      
      toast.info(`Processing ${jsonData.length} rows in ${totalBatches} batches...`);
      setProgress({ current: 5, total: 100 });
      
      for (let i = 0; i < jsonData.length; i += BATCH_SIZE) {
        const batch = jsonData.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        
        // Update progress (5% for parsing, 90% for batches, 5% for finalization)
        const progressPercent = 5 + Math.round((i / jsonData.length) * 90);
        setProgress({ current: progressPercent, total: 100 });
        
        console.log(`[ImportExcel] Sending batch ${batchNum}/${totalBatches} (${batch.length} rows)`);
        
        const { data, error } = await supabase.functions.invoke('import-bills-excel', {
          body: { 
            rows: batch, 
            congress: parseInt(selectedCongress) 
          }
        });
        
        if (error) {
          console.error(`[ImportExcel] Batch ${batchNum} error:`, error);
          allErrors.push(`Batch ${batchNum}: ${error.message}`);
          continue; // Continue with next batch
        }
        
        if (data.success) {
          totalInserted += data.inserted || 0;
          totalErrors += data.errorCount || 0;
          if (data.errors) {
            allErrors.push(...data.errors.slice(0, 5)); // Limit errors per batch
          }
        } else {
          allErrors.push(`Batch ${batchNum}: ${data.error || 'Unknown error'}`);
        }
        
        // Small delay between batches to prevent rate limiting
        if (i + BATCH_SIZE < jsonData.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      setProgress({ current: 100, total: 100 });
      
      // Show results
      toast.success(`Imported ${totalInserted} bills from ${jsonData.length} rows`);
      if (totalErrors > 0) {
        toast.warning(`${totalErrors} rows had errors`);
        console.warn('[ImportExcel] Errors:', allErrors.slice(0, 20));
      }
      
      // Refresh stats
      await queryClient.invalidateQueries({ queryKey: ['billSummaryStats'] });
      
    } catch (err) {
      console.error('[ImportExcel] Error:', err);
      toast.error(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsImporting(false);
      setProgress(null);
      // Reset the file input so the same file can be selected again
      event.target.value = '';
    }
  };

  const handleDeriveTopics = async () => {
    setIsDerivingTopics(true);
    setProgress({ current: 0, total: 100 });
    
    try {
      let totalProcessed = 0;
      let totalEnriched = 0;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase.functions.invoke('backfill-bill-topics', {
          body: { 
            congress: parseInt(selectedCongress),
            batchSize: 500
          }
        });
        
        if (error) throw error;
        
        totalProcessed += data?.processed || 0;
        totalEnriched += data?.enriched || 0;
        hasMore = (data?.remaining || 0) > 0 && (data?.processed || 0) > 0;
        
        setProgress({ 
          current: totalEnriched, 
          total: totalEnriched + (data?.remaining || 0) 
        });
        
        // Rate limit between batches
        if (hasMore) {
          await new Promise(r => setTimeout(r, 300));
        }
      }
      
      toast.success('Topic derivation completed', {
        description: `Enriched ${totalEnriched.toLocaleString()} bills with additional topics`
      });
      
      triggerBackgroundRefresh();
      await queryClient.invalidateQueries({ queryKey: ['bill-summary-stats'] });
    } catch (err) {
      console.error('Error deriving topics:', err);
      toast.error('Failed to derive topics', {
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setIsDerivingTopics(false);
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

  const isProcessing = isFetchingCrs || isGeneratingAi || isIngesting || isSyncing || isFetchingBioguides || isClearing || isResetting || isImporting || isDerivingTopics;

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
              disabled={stats.needsAiGeneration === 0 || isProcessing}
            >
              {isGeneratingAi ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Generate AI ({stats.needsAiGeneration.toLocaleString()})
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
              variant={isIncomplete ? "default" : "secondary"}
              size="sm"
              onClick={handleIngestBills}
              disabled={isProcessing}
            >
              {isIngesting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : isIncomplete ? (
                <PlayCircle className="h-4 w-4 mr-2" />
              ) : (
                <Database className="h-4 w-4 mr-2" />
              )}
              {isIncomplete ? 'Resume' : 'Ingest Bills'}
            </Button>

            {(isIncomplete || isFailed) && (
              <Button 
                variant="ghost"
                size="sm"
                onClick={handleResetIngestion}
                disabled={isProcessing}
                title="Reset ingestion progress"
              >
                {isResetting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
              </Button>
            )}

            <Button 
              variant="outline"
              size="sm"
              onClick={handleNightlySync}
              disabled={isProcessing}
            >
              {isSyncing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CalendarSync className="h-4 w-4 mr-2" />
              )}
              Sync Status
            </Button>

            <Button 
              variant="outline"
              size="sm"
              onClick={handleFetchBioguideIds}
              disabled={isProcessing || stats.billsMissingSponsor === 0}
              title="Fetch bioguide IDs from Congress.gov to link bills to legislator profiles"
            >
              {isFetchingBioguides ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Users className="h-4 w-4 mr-2" />
              )}
              Fetch Bioguide IDs ({stats.billsMissingSponsor.toLocaleString()})
            </Button>

            {/* Excel Import - hidden input with styled label */}
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleImportExcel}
                disabled={isProcessing}
                className="hidden"
              />
              <Button 
                variant="outline"
                size="sm"
                asChild
                disabled={isProcessing}
              >
                <span>
                  {isImporting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Import Excel
                </span>
              </Button>
            </label>

            <Button 
              variant="outline"
              size="sm"
              onClick={handleDeriveTopics}
              disabled={isProcessing}
              title="Derive additional topics from subject terms"
            >
              {isDerivingTopics ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Tags className="h-4 w-4 mr-2" />
              )}
              Derive Topics
            </Button>

            <Button 
              variant="destructive"
              size="sm"
              onClick={handleClearBills}
              disabled={isProcessing}
            >
              {isClearing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Clear Bills
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Incomplete Ingestion Banner */}
        {selectedIngestionStatus && (isIncomplete || isFailed) && !isIngesting && (
          <Alert variant={isFailed ? "destructive" : "default"} className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>
              {isFailed ? 'Ingestion Failed' : 'Incomplete Ingestion'}
            </AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>
                {selectedIngestionStatus.congress}th Congress: {selectedIngestionStatus.totalInserted.toLocaleString()} inserted, {selectedIngestionStatus.totalFiltered.toLocaleString()} filtered
                {selectedIngestionStatus.totalAvailable && ` of ~${selectedIngestionStatus.totalAvailable.toLocaleString()} total`}
                {isFailed && selectedIngestionStatus.errorMessage && ` — Error: ${selectedIngestionStatus.errorMessage}`}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant={isFailed ? "destructive" : "default"} onClick={handleIngestBills} disabled={isProcessing}>
                  <PlayCircle className="h-4 w-4 mr-1" />
                  Resume
                </Button>
                <Button size="sm" variant="outline" onClick={handleResetIngestion} disabled={isProcessing}>
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reset
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Progress Bar */}
        {progress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {isIngesting 
                  ? `Ingesting bills from ${selectedCongress}th Congress...` 
                  : isFetchingBioguides
                    ? 'Fetching bioguide IDs for sponsors & cosponsors...'
                    : isFetchingCrs 
                      ? 'Fetching CRS summaries...' 
                      : 'Generating AI summaries...'}
              </span>
              <span className="font-medium">
                {isIngesting && progress.inserted !== undefined && progress.checked !== undefined ? (
                  <>
                    <span className="text-green-600">{progress.inserted.toLocaleString()} inserted</span>
                    <span className="text-muted-foreground mx-1">•</span>
                    <span>{progress.checked.toLocaleString()} / {progress.total.toLocaleString()} checked</span>
                  </>
                ) : (
                  <>
                    {progress.current.toLocaleString()} / {progress.total.toLocaleString()}
                    {progress.filtered !== undefined && progress.filtered > 0 && (
                      <span className="text-muted-foreground ml-1">
                        ({progress.filtered.toLocaleString()} filtered)
                      </span>
                    )}
                  </>
                )}
              </span>
            </div>
            <Progress 
              value={progress.total > 0 
                ? ((isIngesting && progress.checked !== undefined ? progress.checked : progress.current) / progress.total) * 100 
                : 0
              } 
              className="h-2" 
            />
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
              <Wand2 className="h-3.5 w-3.5" />
              Needs AI
            </div>
            <div className="text-2xl font-bold text-amber-600">{stats.needsAiGeneration.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">CRS unavailable</div>
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

        {/* Bill Status Breakdown */}
        <div className="bg-muted/30 rounded-lg p-4 border border-muted">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">Bills by Status</div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch 
                  id="include-resolutions"
                  checked={includeResolutions}
                  onCheckedChange={setIncludeResolutions}
                />
                <label htmlFor="include-resolutions" className="text-xs text-muted-foreground cursor-pointer">
                  Include resolutions
                </label>
              </div>
              <div className="text-xs text-muted-foreground">
                {selectedCongress}th Congress • {stats.selectedCongressTotal.toLocaleString()} bills
                {!includeResolutions && ' (HR, S, HJRES, SJRES only)'}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="text-center p-2 rounded bg-slate-500/10">
              <div className="flex items-center justify-center gap-1 text-xs text-slate-600 mb-1">
                <FileText className="h-3 w-3" />
                Introduced
              </div>
              <div className="text-lg font-bold">{stats.statusBreakdown.introduced.toLocaleString()}</div>
            </div>
            <div className="text-center p-2 rounded bg-blue-500/10">
              <div className="flex items-center justify-center gap-1 text-xs text-blue-600 mb-1">
                <Gavel className="h-3 w-3" />
                Passed One
              </div>
              <div className="text-lg font-bold text-blue-600">{stats.statusBreakdown.passedOneChamber.toLocaleString()}</div>
            </div>
            <div className="text-center p-2 rounded bg-indigo-500/10">
              <div className="flex items-center justify-center gap-1 text-xs text-indigo-600 mb-1">
                <Scale className="h-3 w-3" />
                Passed Both
              </div>
              <div className="text-lg font-bold text-indigo-600">{stats.statusBreakdown.passedBothChambers.toLocaleString()}</div>
            </div>
            <div className="text-center p-2 rounded bg-cyan-500/10">
              <div className="flex items-center justify-center gap-1 text-xs text-cyan-600 mb-1">
                <RefreshCw className="h-3 w-3" />
                Resolving
              </div>
              <div className="text-lg font-bold text-cyan-600">{stats.statusBreakdown.resolvingDifferences.toLocaleString()}</div>
            </div>
            <div className="text-center p-2 rounded bg-amber-500/10">
              <div className="flex items-center justify-center gap-1 text-xs text-amber-600 mb-1">
                <Send className="h-3 w-3" />
                To President
              </div>
              <div className="text-lg font-bold text-amber-600">{stats.statusBreakdown.toPresident.toLocaleString()}</div>
            </div>
            <div className="text-center p-2 rounded bg-red-500/10">
              <div className="flex items-center justify-center gap-1 text-xs text-red-600 mb-1">
                <XOctagon className="h-3 w-3" />
                Veto Actions
              </div>
              <div className="text-lg font-bold text-red-600">{stats.statusBreakdown.vetoActions.toLocaleString()}</div>
            </div>
            <div className="text-center p-2 rounded bg-green-500/10">
              <div className="flex items-center justify-center gap-1 text-xs text-green-600 mb-1">
                <Landmark className="h-3 w-3" />
                Became Law
              </div>
              <div className="text-lg font-bold text-green-600">{stats.statusBreakdown.becameLaw.toLocaleString()}</div>
            </div>
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
              Needs AI: {stats.needsAiGeneration.toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              Pending Fetch: {stats.pendingFetch.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Topic Distribution Chart */}
        {stats.topicBreakdown.length > 0 && (
          <div className="bg-muted/30 rounded-lg p-4 border border-muted">
            <div className="text-sm font-medium mb-3">Bills by Topic</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={stats.topicBreakdown} 
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                >
                  <XAxis type="number" />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    width={95}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip 
                    formatter={(value: number) => [value.toLocaleString(), 'Bills']}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {stats.topicBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

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
