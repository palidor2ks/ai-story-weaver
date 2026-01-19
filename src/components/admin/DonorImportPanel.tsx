import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Copy, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import Papa from 'papaparse';

interface ImportStats {
  totalRows: number;
  processedRows: number;
  insertedContributions: number;
  insertedDonors: number;
  skippedRows: number;
  errors: string[];
}

interface DebugInfo {
  batchNumber: number;
  httpStatus?: number;
  errorMessage?: string;
  errorContext?: string;
  requestId?: string;
  timestamp: string;
  cycle: string;
  committeeId: string;
}

export function DonorImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [cycle, setCycle] = useState('2024');
  const [candidateId, setCandidateId] = useState('');
  const [committeeId, setCommitteeId] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [detectedCommittee, setDetectedCommittee] = useState<string | null>(null);
  const [existingCount, setExistingCount] = useState<number | null>(null);
  const [lastDebugInfo, setLastDebugInfo] = useState<DebugInfo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const BATCH_SIZE = 500;
  const DELAY_MS = 150;  // Slightly more delay for stability
  const MAX_RETRIES = 5;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setStats(null);
    setProgress(0);
    setDetectedCommittee(null);
    setExistingCount(null);
    setLastDebugInfo(null);

    // Parse first few rows to detect committee
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').slice(0, 10);
      
      Papa.parse(lines.join('\n'), {
        header: true,
        complete: async (results) => {
          if (results.data.length > 0) {
            const firstRow = results.data[0] as any;
            const detectedId = firstRow.committee_id || firstRow.COMMITTEE_ID;
            const detectedName = firstRow.committee_name || firstRow.COMMITTEE_NAME;
            
            if (detectedId) {
              setCommitteeId(detectedId);
              setDetectedCommittee(detectedName || detectedId);
              
              // Check existing contributions for this committee
              const { count } = await supabase
                .from('contributions')
                .select('*', { count: 'exact', head: true })
                .eq('recipient_committee_id', detectedId);
              
              setExistingCount(count || 0);

              // Try to find candidate_id from committee
              const { data: committee } = await supabase
                .from('candidate_committees')
                .select('candidate_id')
                .eq('fec_committee_id', detectedId)
                .single();
              
              if (committee?.candidate_id) {
                setCandidateId(committee.candidate_id);
              }
            }
          }
        }
      });
    };
    reader.readAsText(selectedFile.slice(0, 10000)); // Read first 10KB to detect
  };

  const copyDebugInfo = () => {
    if (!lastDebugInfo) return;
    
    const debugText = JSON.stringify(lastDebugInfo, null, 2);
    navigator.clipboard.writeText(debugText);
    toast.success('Debug info copied to clipboard');
  };

  const handleImport = async () => {
    if (!file) {
      toast.error('Please select a CSV file');
      return;
    }

    setIsImporting(true);
    setProgress(0);
    setLastDebugInfo(null);
    setStats({
      totalRows: 0,
      processedRows: 0,
      insertedContributions: 0,
      insertedDonors: 0,
      skippedRows: 0,
      errors: []
    });

    try {
      // Parse entire file
      const text = await file.text();
      
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          const allRows = results.data as any[];
          const totalRows = allRows.length;
          
          setStats(prev => prev ? { ...prev, totalRows } : null);
          
          console.log(`[DonorImport] Starting import of ${totalRows} rows`);
          
          let processedRows = 0;
          let insertedContributions = 0;
          let insertedDonors = 0;
          let skippedRows = 0;
          const errors: string[] = [];

          // Process in batches with retry logic
          for (let i = 0; i < totalRows; i += BATCH_SIZE) {
            const batch = allRows.slice(i, i + BATCH_SIZE);
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(totalRows / BATCH_SIZE);
            
            let success = false;
            let retryCount = 0;
            
            while (!success && retryCount < MAX_RETRIES) {
              try {
                const { data, error } = await supabase.functions.invoke('import-fec-receipts-csv', {
                  body: {
                    rows: batch,
                    cycle,
                    candidateId: candidateId || null,
                    committeeId: committeeId || null
                  }
                });

                if (error) {
                  // Capture debug info
                  const debugInfo: DebugInfo = {
                    batchNumber: batchNum,
                    httpStatus: error.status,
                    errorMessage: error.message,
                    errorContext: error.context?.toString(),
                    timestamp: new Date().toISOString(),
                    cycle,
                    committeeId
                  };
                  setLastDebugInfo(debugInfo);
                  
                  // Check for retryable errors
                  const isRetryable = 
                    error.message?.includes('WORKER_LIMIT') || 
                    error.message?.includes('546') ||
                    error.message?.includes('statement timeout') ||
                    error.message?.includes('connection closed') ||
                    error.message?.includes('upstream request timeout') ||
                    error.status === 504 ||
                    error.status === 503;
                  
                  if (isRetryable && retryCount < MAX_RETRIES - 1) {
                    retryCount++;
                    const backoffMs = Math.pow(2, retryCount) * 1000 + Math.random() * 500;
                    console.log(`[DonorImport] Batch ${batchNum}/${totalBatches} retry ${retryCount}/${MAX_RETRIES} after ${Math.round(backoffMs)}ms: ${error.message}`);
                    await new Promise(resolve => setTimeout(resolve, backoffMs));
                    continue;
                  }
                  
                  console.error(`[DonorImport] Batch ${batchNum} error:`, error);
                  errors.push(`Batch ${batchNum}: ${error.message || 'Unknown error'}`);
                } else if (data) {
                  // Check for errors in the response
                  const hasTimeoutError = data.errors?.some((e: string) => 
                    e.includes('statement timeout') || 
                    e.includes('canceling statement') ||
                    e.includes('connection closed')
                  );
                  
                  if (hasTimeoutError && retryCount < MAX_RETRIES - 1) {
                    retryCount++;
                    const backoffMs = Math.pow(2, retryCount) * 1000 + Math.random() * 500;
                    console.log(`[DonorImport] Batch ${batchNum} partial timeout, retry ${retryCount}/${MAX_RETRIES} after ${Math.round(backoffMs)}ms`);
                    await new Promise(resolve => setTimeout(resolve, backoffMs));
                    continue;
                  }
                  
                  insertedContributions += data.insertedContributions || 0;
                  insertedDonors += data.insertedDonors || 0;
                  skippedRows += data.skippedRows || 0;
                  
                  if (data.timing) {
                    console.log(`[DonorImport] Batch ${batchNum}/${totalBatches} timing:`, data.timing);
                  }
                  
                  if (data.errors && data.errors.length > 0) {
                    errors.push(...data.errors.slice(0, 3).map((e: string) => `Batch ${batchNum}: ${e}`));
                  }
                }
                success = true;
              } catch (err: any) {
                // Capture debug info for exceptions
                const debugInfo: DebugInfo = {
                  batchNumber: batchNum,
                  errorMessage: err.message,
                  errorContext: err.stack?.slice(0, 500),
                  timestamp: new Date().toISOString(),
                  cycle,
                  committeeId
                };
                setLastDebugInfo(debugInfo);
                
                // Check for retryable network/worker errors
                const isRetryable = 
                  err.message?.includes('WORKER_LIMIT') || 
                  err.message?.includes('546') || 
                  err.message?.includes('Failed to send') ||
                  err.message?.includes('statement timeout') ||
                  err.message?.includes('connection closed') ||
                  err.message?.includes('fetch') ||
                  err.message?.includes('network');
                
                if (isRetryable && retryCount < MAX_RETRIES - 1) {
                  retryCount++;
                  const backoffMs = Math.pow(2, retryCount) * 1000 + Math.random() * 500;
                  console.log(`[DonorImport] Batch ${batchNum} exception, retry ${retryCount}/${MAX_RETRIES} after ${Math.round(backoffMs)}ms: ${err.message}`);
                  await new Promise(resolve => setTimeout(resolve, backoffMs));
                  continue;
                }
                
                console.error(`[DonorImport] Batch ${batchNum} exception:`, err);
                errors.push(`Batch ${batchNum}: ${err.message}`);
                success = true; // Don't retry non-recoverable errors
              }
            }
            
            if (!success) {
              errors.push(`Batch ${batchNum}: Failed after ${MAX_RETRIES} retries`);
            }

            processedRows = Math.min(i + BATCH_SIZE, totalRows);
            setProgress(Math.round((processedRows / totalRows) * 100));
            setStats({
              totalRows,
              processedRows,
              insertedContributions,
              insertedDonors,
              skippedRows,
              errors
            });

            // Rate limiting delay between batches
            if (i + BATCH_SIZE < totalRows) {
              await new Promise(resolve => setTimeout(resolve, DELAY_MS));
            }
          }

          setProgress(100);
          
          if (errors.length > 0) {
            toast.warning(`Import complete with ${errors.length} errors: ${insertedContributions} contributions added`);
          } else {
            toast.success(`Import complete: ${insertedContributions} contributions added`);
          }
        },
        error: (error) => {
          console.error('CSV parse error:', error);
          toast.error('Failed to parse CSV file');
        }
      });
    } catch (err: any) {
      console.error('Import error:', err);
      toast.error(`Import failed: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setStats(null);
    setProgress(0);
    setDetectedCommittee(null);
    setExistingCount(null);
    setCandidateId('');
    setCommitteeId('');
    setLastDebugInfo(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          FEC Receipts CSV Import
        </CardTitle>
        <CardDescription>
          Import FEC Schedule A bulk download CSV files. Existing contributions will be skipped (deduped by sub_id).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* File Selection */}
        <div className="space-y-2">
          <Label htmlFor="csv-file">CSV File</Label>
          <div className="flex gap-2">
            <Input
              ref={fileInputRef}
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              disabled={isImporting}
              className="flex-1"
            />
            {file && (
              <Button variant="outline" size="sm" onClick={resetForm} disabled={isImporting}>
                Clear
              </Button>
            )}
          </div>
          {file && (
            <p className="text-sm text-muted-foreground">
              Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
        </div>

        {/* Detected Committee Info */}
        {detectedCommittee && (
          <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Detected</Badge>
              <span className="font-medium">{detectedCommittee}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              Committee ID: {committeeId}
              {existingCount !== null && (
                <span className="ml-4">
                  Existing contributions: <strong>{existingCount.toLocaleString()}</strong>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Configuration */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cycle">Election Cycle</Label>
            <Select value={cycle} onValueChange={setCycle} disabled={isImporting}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2026">2026</SelectItem>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2022">2022</SelectItem>
                <SelectItem value="2020">2020</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="candidate-id">
              Candidate ID <span className="text-destructive">*</span>
            </Label>
            <Input
              id="candidate-id"
              value={candidateId}
              onChange={(e) => setCandidateId(e.target.value)}
              placeholder="e.g., G000574"
              disabled={isImporting}
              className={!candidateId && file ? 'border-amber-500' : ''}
            />
            {!candidateId && file && (
              <p className="text-xs text-amber-600">
                ⚠️ Required for reconciliation. Auto-detected from committee if linked.
              </p>
            )}
          </div>
        </div>

        {/* Progress */}
        {(isImporting || stats) && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>

            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 rounded-lg bg-muted">
                  <div className="text-2xl font-bold">{stats.totalRows.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">Total Rows</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted">
                  <div className="text-2xl font-bold text-green-600">{stats.insertedContributions.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">Contributions Added</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted">
                  <div className="text-2xl font-bold text-blue-600">{stats.insertedDonors.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">Donors Updated</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted">
                  <div className="text-2xl font-bold text-amber-600">{stats.skippedRows.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">Skipped/Dupes</div>
                </div>
              </div>
            )}

            {stats?.errors && stats.errors.length > 0 && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-destructive font-medium">
                    <AlertCircle className="h-4 w-4" />
                    Errors ({stats.errors.length})
                  </div>
                  {lastDebugInfo && (
                    <Button variant="ghost" size="sm" onClick={copyDebugInfo} className="text-destructive">
                      <Copy className="h-3 w-3 mr-1" />
                      Copy Debug Info
                    </Button>
                  )}
                </div>
                <ul className="text-sm text-destructive/80 space-y-1">
                  {stats.errors.slice(0, 5).map((err, i) => (
                    <li key={i} className="truncate">{err}</li>
                  ))}
                </ul>
                <a 
                  href="https://supabase.com/dashboard/project/ornnzinjrcyigazecctf/functions/import-fec-receipts-csv/logs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-2"
                >
                  <ExternalLink className="h-3 w-3" />
                  View Edge Function Logs
                </a>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            onClick={handleImport}
            disabled={!file || isImporting || !candidateId}
            className="flex-1"
          >
            {isImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : progress === 100 ? (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Complete
              </>
            ) : !candidateId && file ? (
              <>
                <AlertCircle className="mr-2 h-4 w-4" />
                Candidate ID Required
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Import CSV
              </>
            )}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          CSV should be a FEC bulk download with columns: sub_id, contributor_name, contribution_receipt_amount, 
          contribution_receipt_date, committee_id, entity_type, line_number, memo_text, etc.
        </p>
      </CardContent>
    </Card>
  );
}
