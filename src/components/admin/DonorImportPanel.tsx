import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Copy, ExternalLink, XCircle, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import Papa from 'papaparse';

interface ImportStats {
  totalRows: number;
  processedRows: number;
  insertedContributions: number;  // Actual new inserts
  skippedDuplicates: number;      // Already existed
  insertedDonors: number;
  skippedRows: number;            // Invalid/missing data
  errors: string[];
  corruptedSubIds: number;        // For file health warning
  uniqueHashes: number;           // For collision detection
  currentBatch: number;           // Current batch number
  totalBatches: number;           // Total batch count
  committeeBreakdown: Record<string, { rows: number; inserted: number; candidate_id: string | null }>;
  unmappedCommittees: string[];
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

interface CommitteePreview {
  committee_id: string;
  candidate_id: string | null;
  candidate_name: string | null;
  row_count: number;
}

export function DonorImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [cycle, setCycle] = useState('2024');
  const [candidateId, setCandidateId] = useState('');
  const [committeeId, setCommitteeId] = useState('');
  const [multiCommittee, setMultiCommittee] = useState(false);
  const [committeePreview, setCommitteePreview] = useState<CommitteePreview[] | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [detectedCommittee, setDetectedCommittee] = useState<string | null>(null);
  const [existingCount, setExistingCount] = useState<number | null>(null);
  const [lastDebugInfo, setLastDebugInfo] = useState<DebugInfo | null>(null);
  const [fileHealthWarning, setFileHealthWarning] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentSessionRef = useRef<string | null>(null);

  const BATCH_SIZE = 500;
  const DELAY_MS = 150;  // Slightly more delay for stability
  const MAX_RETRIES = 5;

  // Cancel the current import session
  const cancelImport = useCallback(() => {
    if (currentSessionRef.current) {
      console.log(`[DonorImport] Cancelling session ${currentSessionRef.current}`);
      currentSessionRef.current = null;
      setActiveSessionId(null);
      setIsImporting(false);
      toast.info('Import cancelled');
    }
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setStats(null);
    setProgress(0);
    setDetectedCommittee(null);
    setExistingCount(null);
    setFileHealthWarning(null);
    setLastDebugInfo(null);
    setCommitteePreview(null);

    // Parse first 500 rows to detect committee and check file health
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      
      Papa.parse(text, {
        header: true,
        preview: 500, // Check first 500 rows for health
        complete: async (results) => {
          if (results.data.length > 0) {
            const rows = results.data as any[];
            const firstRow = rows[0];
            const detectedId = firstRow.committee_id || firstRow.COMMITTEE_ID;
            const detectedName = firstRow.committee_name || firstRow.COMMITTEE_NAME;
            
            // Check for corrupted sub_id values (scientific notation from Excel)
            let corruptedCount = 0;
            const subIdSet = new Set<string>();
            for (const row of rows) {
              const subId = row.sub_id || row.SUB_ID || '';
              subIdSet.add(subId);
              // Check for scientific notation patterns
              if (/[eE][+-]?\d+/.test(subId) || (subId.includes('.') && subId.length < 15)) {
                corruptedCount++;
              }
            }
            
            // Warn if high corruption or collision rate
            const collisionRate = 1 - (subIdSet.size / rows.length);
            if (corruptedCount > rows.length * 0.1) {
              setFileHealthWarning(
                `⚠️ ${Math.round(corruptedCount/rows.length*100)}% of rows have corrupted sub_id values (scientific notation). ` +
                `This usually happens when the CSV was opened in Excel. Re-download the CSV from FEC and avoid opening it in Excel before import.`
              );
            } else if (collisionRate > 0.5) {
              setFileHealthWarning(
                `⚠️ High sub_id collision rate (${Math.round(collisionRate*100)}%). ` +
                `Only ${subIdSet.size} unique IDs found in ${rows.length} rows. This may cause data to be overwritten.`
              );
            } else {
              setFileHealthWarning(null);
            }
            
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
    reader.readAsText(selectedFile.slice(0, 500000)); // Read first 500KB to detect and check health
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

    // Prevent concurrent imports
    if (isImporting && currentSessionRef.current) {
      toast.warning('An import is already in progress. Cancel it first to start a new one.');
      return;
    }

    // Generate unique session ID
    const sessionId = `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    currentSessionRef.current = sessionId;
    setActiveSessionId(sessionId);

    setIsImporting(true);
    setProgress(0);
    setLastDebugInfo(null);
    setStats({
      totalRows: 0,
      processedRows: 0,
      insertedContributions: 0,
      skippedDuplicates: 0,
      insertedDonors: 0,
      skippedRows: 0,
      errors: [],
      corruptedSubIds: 0,
      uniqueHashes: 0,
      currentBatch: 0,
      totalBatches: 0,
      committeeBreakdown: {},
      unmappedCommittees: []
    });

    console.log(`[DonorImport] Starting session ${sessionId}`);

    try {
      // Parse entire file
      const text = await file.text();
      
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          const allRows = results.data as any[];
          const totalRows = allRows.length;
          const totalBatches = Math.ceil(totalRows / BATCH_SIZE);
          
          // Check if session was cancelled before starting
          if (currentSessionRef.current !== sessionId) {
            console.log(`[DonorImport] Session ${sessionId} cancelled before start`);
            return;
          }
          
          setStats(prev => prev ? { ...prev, totalRows, totalBatches } : null);
          
          console.log(`[DonorImport] Session ${sessionId}: Starting import of ${totalRows} rows in ${totalBatches} batches`);
          
          let processedRows = 0;
          let insertedContributions = 0;
          let skippedDuplicates = 0;
          let insertedDonors = 0;
          let skippedRows = 0;
          let corruptedSubIds = 0;
          let uniqueHashes = 0;
          const errors: string[] = [];
          const committeeBreakdown: Record<string, { rows: number; inserted: number; candidate_id: string | null }> = {};
          const unmappedCommitteesSet = new Set<string>();

          // Process in batches with retry logic
          for (let i = 0; i < totalRows; i += BATCH_SIZE) {
            // Check if session was cancelled
            if (currentSessionRef.current !== sessionId) {
              console.log(`[DonorImport] Session ${sessionId} cancelled at batch ${Math.floor(i / BATCH_SIZE) + 1}`);
              return;
            }
            
            const batch = allRows.slice(i, i + BATCH_SIZE);
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            
            let success = false;
            let retryCount = 0;
            
            while (!success && retryCount < MAX_RETRIES) {
              try {
                const { data, error } = await supabase.functions.invoke('import-fec-receipts-csv', {
                  body: {
                    rows: batch,
                    cycle,
                    candidateId: multiCommittee ? null : (candidateId || null),
                    committeeId: multiCommittee ? null : (committeeId || null),
                    multiCommittee
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
                  skippedDuplicates += data.skippedDuplicates || 0;
                  insertedDonors += data.insertedDonors || 0;
                  skippedRows += data.skippedRows || 0;
                  corruptedSubIds += data.corruptedSubIds || 0;
                  uniqueHashes += data.uniqueHashes || 0;

                  // Aggregate per-committee breakdown across batches
                  if (data.committeeBreakdown) {
                    for (const [cid, info] of Object.entries(data.committeeBreakdown as Record<string, { rows: number; candidate_id: string | null }>)) {
                      const inserted = Math.round(
                        ((info.rows || 0) / Math.max(1, data.processed || batch.length)) * (data.insertedContributions || 0)
                      );
                      const existing = committeeBreakdown[cid];
                      if (existing) {
                        existing.rows += info.rows || 0;
                        existing.inserted += inserted;
                      } else {
                        committeeBreakdown[cid] = { rows: info.rows || 0, inserted, candidate_id: info.candidate_id };
                      }
                    }
                  }
                  if (Array.isArray(data.unmappedCommittees)) {
                    for (const cid of data.unmappedCommittees) unmappedCommitteesSet.add(cid);
                  }
                  
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
            
            // Only update stats if this session is still active
            if (currentSessionRef.current === sessionId) {
              setProgress(Math.round((processedRows / totalRows) * 100));
              setStats({
                totalRows,
                processedRows,
                insertedContributions,
                skippedDuplicates,
                insertedDonors,
                skippedRows,
                errors,
                corruptedSubIds,
                uniqueHashes,
                currentBatch: batchNum,
                totalBatches,
                committeeBreakdown: { ...committeeBreakdown },
                unmappedCommittees: Array.from(unmappedCommitteesSet)
              });
            }

            // Rate limiting delay between batches
            if (i + BATCH_SIZE < totalRows) {
              await new Promise(resolve => setTimeout(resolve, DELAY_MS));
            }
          }

          // Only update final state if session is still active
          if (currentSessionRef.current === sessionId) {
            setProgress(100);
            setActiveSessionId(null);
            currentSessionRef.current = null;
            
            if (errors.length > 0) {
              toast.warning(`Import complete with ${errors.length} errors: ${insertedContributions} contributions added`);
            } else {
              toast.success(`Import complete: ${insertedContributions} contributions added`);
            }
          }
        },
        error: (error) => {
          if (currentSessionRef.current === sessionId) {
            console.error('CSV parse error:', error);
            toast.error('Failed to parse CSV file');
          }
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
    // Cancel any active import first
    if (currentSessionRef.current) {
      currentSessionRef.current = null;
      setActiveSessionId(null);
    }
    setFile(null);
    setStats(null);
    setProgress(0);
    setDetectedCommittee(null);
    setExistingCount(null);
    setCandidateId('');
    setCommitteeId('');
    setLastDebugInfo(null);
    setFileHealthWarning(null);
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

        {/* File Health Warning */}
        {fileHealthWarning && (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-700 dark:text-amber-400">
                {fileHealthWarning}
              </div>
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

            {/* Session indicator */}
            {activeSessionId && (
              <div className="flex items-center justify-between p-2 rounded-lg bg-primary/10 border border-primary/20">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-muted-foreground">Session:</span>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{activeSessionId.slice(7, 19)}</code>
                  {stats?.currentBatch && stats?.totalBatches && (
                    <span className="text-muted-foreground">
                      Batch {stats.currentBatch}/{stats.totalBatches}
                    </span>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={cancelImport} className="text-destructive hover:text-destructive">
                  <XCircle className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              </div>
            )}

            {stats && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 rounded-lg bg-muted">
                    <div className="text-2xl font-bold">{stats.totalRows.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">Total Rows</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted">
                    <div className="text-2xl font-bold text-green-600">{stats.insertedContributions.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">New Contributions</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted">
                    <div className="text-2xl font-bold text-blue-600">{stats.skippedDuplicates.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">Already Existed</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted">
                    <div className="text-2xl font-bold text-amber-600">{stats.skippedRows.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">Invalid/Skipped</div>
                  </div>
                </div>
                
                {/* Secondary stats row */}
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-center p-2 rounded bg-muted/50">
                    <span className="text-muted-foreground">Donors: </span>
                    <span className="font-medium">{stats.insertedDonors.toLocaleString()}</span>
                  </div>
                  {stats.corruptedSubIds > 0 && (
                    <div className="text-center p-2 rounded bg-amber-100 dark:bg-amber-900/20">
                      <span className="text-amber-700 dark:text-amber-400">Corrupted IDs: </span>
                      <span className="font-medium text-amber-700 dark:text-amber-400">{stats.corruptedSubIds.toLocaleString()}</span>
                    </div>
                  )}
                  {stats.uniqueHashes > 0 && stats.uniqueHashes < stats.processedRows * 0.9 && (
                    <div className="text-center p-2 rounded bg-amber-100 dark:bg-amber-900/20">
                      <span className="text-amber-700 dark:text-amber-400">Unique IDs: </span>
                      <span className="font-medium text-amber-700 dark:text-amber-400">{stats.uniqueHashes.toLocaleString()}</span>
                    </div>
                  )}
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
