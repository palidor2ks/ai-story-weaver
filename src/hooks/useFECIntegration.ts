import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FECCandidate {
  candidate_id: string;
  name: string;
  party: string;
  office: string;
  state: string;
  district?: string;
  cycles: number[];
}

interface FetchFECIdResult {
  found: boolean;
  updated?: boolean;
  fecCandidateId?: string;
  candidates?: FECCandidate[];
  error?: string;
}

interface FetchDonorsResult {
  success: boolean;
  imported: number;
  totalRaised?: number;
  cycle?: string;
  message?: string;
  error?: string;
  hasMore?: boolean;
  stoppedDueToTimeout?: boolean;
  committeesRemaining?: number;
  committeesSynced?: string;
  // Rate limit tracking
  hitRateLimit?: boolean;
  rateLimitWaitMs?: number;
  reconciliation?: {
    localItemized: number;
    localTransfers: number;
    fecItemized: number;
    deltaPct: number;
    status: string;
  };
}

interface FetchCommitteesResult {
  success: boolean;
  committees: Array<{
    id: string;
    name: string;
    designation: string;
    isPrimary: boolean;
  }>;
  primaryCommitteeId: string | null;
  primaryCommitteeName?: string;
  message?: string;
  error?: string;
}

interface SyncProgress {
  candidateId: string;
  candidateName: string;
  committeesSynced: number;
  committeesTotal: number;
  donorsImported: number;
  isComplete: boolean;
  // Progress tracking for auto-resume
  localItemized?: number;
  fecItemized?: number;
  estimatedProgress?: number;
  attempts?: number;
  isAutoResuming?: boolean;
  // Rate limit tracking
  isWaitingForRateLimit?: boolean;
  rateLimitWaitSeconds?: number;
}

interface SyncAllProgress {
  candidatesCompleted: number;
  candidatesTotal: number;
  currentCandidate: string;
  totalDonorsImported: number;
  totalRaised: number;
  errors: string[];
  isRunning: boolean;
  startTime: number;
}

export function useFECIntegration() {
  // All useState hooks must be in consistent order
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [donorLoadingIds, setDonorLoadingIds] = useState<Set<string>>(new Set());
  const [committeeLoadingIds, setCommitteeLoadingIds] = useState<Set<string>>(new Set());
  const [reconcileLoadingIds, setReconcileLoadingIds] = useState<Set<string>>(new Set());
  const [totalsLoadingIds, setTotalsLoadingIds] = useState<Set<string>>(new Set());
  const [partialSyncIds, setPartialSyncIds] = useState<Set<string>>(new Set());
  const [highVolumeMode, setHighVolumeMode] = useState<boolean>(false); // Smaller batches for massive candidates
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    currentName: string;
  } | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncAllProgress, setSyncAllProgress] = useState<SyncAllProgress | null>(null);
  const [totalsProgress, setTotalsProgress] = useState<{ current: number; total: number } | null>(null);
  const cancelSyncAllRef = useRef(false);

  const isLoading = (candidateId: string) => loadingIds.has(candidateId);
  const isDonorLoading = (candidateId: string) => donorLoadingIds.has(candidateId);
  const isCommitteeLoading = (candidateId: string) => committeeLoadingIds.has(candidateId);
  const isReconcileLoading = (candidateId: string) => reconcileLoadingIds.has(candidateId);
  const isTotalsLoading = (candidateId: string) => totalsLoadingIds.has(candidateId);
  const hasPartialSync = (candidateId: string) => partialSyncIds.has(candidateId);

  const fetchFECCandidateId = async (
    candidateId: string,
    candidateName: string,
    state: string,
    updateDatabase = true,
    autoFetchDonors = true
  ): Promise<FetchFECIdResult> => {
    setLoadingIds(prev => new Set(prev).add(candidateId));
    
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.access_token) {
        const msg = 'Your session has expired. Please sign in again.';
        toast.error(msg);
        return { found: false, error: msg };
      }

      const { data, error } = await supabase.functions.invoke('fetch-fec-candidate-id', {
        body: { candidateId, candidateName, state, updateDatabase }
      });

      if (error) {
        console.error('[FEC] Error:', error);
        return { found: false, error: error.message };
      }

      const result = data as FetchFECIdResult;

      // Auto-fetch donors if FEC ID was found and updated
      if (autoFetchDonors && result.found && result.updated && result.fecCandidateId) {
        console.log('[FEC] Auto-fetching donors for', candidateName);
        toast.info(`Fetching donor data for ${candidateName}...`);
        
        const donorResult = await fetchFECDonorsComplete(candidateId, result.fecCandidateId, candidateName);
        if (donorResult.success) {
          toast.success(`Imported ${donorResult.imported} donors for ${candidateName}`);
        } else if (donorResult.error) {
          toast.error(`Failed to fetch donors: ${donorResult.error}`);
        }
      }

      return result;
    } catch (err) {
      console.error('[FEC] Exception:', err);
      return { found: false, error: 'Failed to fetch FEC candidate ID' };
    } finally {
      setLoadingIds(prev => {
        const next = new Set(prev);
        next.delete(candidateId);
        return next;
      });
    }
  };

  // Fetch and link FEC committees for a candidate
  const fetchFECCommittees = async (
    candidateId: string,
    fecCandidateId: string
  ): Promise<FetchCommitteesResult> => {
    setCommitteeLoadingIds(prev => new Set(prev).add(candidateId));

    try {
      const { data, error } = await supabase.functions.invoke('fetch-fec-committees', {
        body: { candidateId, fecCandidateId }
      });

      if (error) {
        console.error('[FEC-COMMITTEES] Invoke error:', error);
        return { success: false, committees: [], primaryCommitteeId: null, error: error.message };
      }

      if (data?.error) {
        console.warn('[FEC-COMMITTEES] Function returned error:', data.error);
        return { success: false, committees: [], primaryCommitteeId: null, error: String(data.error) };
      }

      return data as FetchCommitteesResult;
    } catch (err) {
      console.error('[FEC-COMMITTEES] Exception:', err);
      return { success: false, committees: [], primaryCommitteeId: null, error: 'Failed to fetch committees' };
    } finally {
      setCommitteeLoadingIds(prev => {
        const next = new Set(prev);
        next.delete(candidateId);
        return next;
      });
    }
  };

  // Single call to fetch donors (may return hasMore=true)
  const fetchFECDonorsSingle = async (
    candidateId: string,
    fecCandidateId: string,
    cycle = '2024',
    forceFullSync = false,
    useHighVolumeMode?: boolean // Override hook state if provided
  ): Promise<FetchDonorsResult> => {
    const effectiveHighVolumeMode = useHighVolumeMode ?? highVolumeMode;
    const normalizeInvokeError = (raw: unknown) => {
      const msg = typeof raw === 'string'
        ? raw
        : (typeof raw === 'object' && raw !== null && 'message' in raw && typeof (raw as { message?: unknown }).message === 'string')
          ? (raw as { message: string }).message
          : JSON.stringify(raw);

      // Supabase often returns: "Edge function returned 400: Error, {\"error\":\"...\"}"
      const jsonMatch = msg.match(/\{[\s\S]*\}$/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed?.error && typeof parsed.error === 'string') return parsed.error;
        } catch {
          // ignore
        }
      }
      return msg;
    };

    try {
      if (!fecCandidateId) {
        return { success: false, imported: 0, error: 'Missing FEC candidate ID. Link FEC ID first.', hasMore: false };
      }

      const invokeOnce = () =>
        supabase.functions.invoke('fetch-fec-donors', {
          body: { candidateId, fecCandidateId, cycle, forceFullSync, highVolumeMode: effectiveHighVolumeMode }
        });

      const isRetryableNetworkError = (raw: unknown) => {
        const msg = normalizeInvokeError(raw);
        return /failed to fetch|fetch failed|networkerror|load failed|timeout/i.test(msg);
      };

      let data: unknown;
      let error: unknown;

      for (let attempt = 1; attempt <= 3; attempt++) {
        const res = await invokeOnce();
        data = res.data;
        error = res.error;

        if (!error) break;

        if (attempt < 3 && isRetryableNetworkError(error)) {
          const delayMs = attempt === 1 ? 1500 : 3500;
          console.warn(`[FEC-DONORS] Retryable invoke error (attempt ${attempt}). Retrying in ${delayMs}ms...`, error);
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        break;
      }

      // Handle Supabase invoke error (network/auth/function 4xx/5xx)
      if (error) {
        console.error('[FEC-DONORS] Invoke error:', error);
        return { success: false, imported: 0, error: normalizeInvokeError(error), hasMore: false };
      }

      // Handle edge function returning an error in the response body
      if ((data as any)?.error) {
        console.warn('[FEC-DONORS] Function returned error:', (data as any).error);
        return { success: false, imported: 0, error: String((data as any).error), hasMore: false };
      }

      // Success
      return data as FetchDonorsResult;
    } catch (err) {
      console.error('[FEC-DONORS] Exception:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch donors';
      return { success: false, imported: 0, error: normalizeInvokeError(errorMessage), hasMore: false };
    }
  };

  // Complete fetch: loops until hasMore=false with optional unlimited auto-resume
  const fetchFECDonorsComplete = async (
    candidateId: string,
    fecCandidateId: string,
    candidateName: string,
    cycle = '2024',
    forceFullSync = false,
    unlimitedAutoResume = false // When true, keeps retrying indefinitely until complete
  ): Promise<FetchDonorsResult> => {
    setDonorLoadingIds(prev => new Set(prev).add(candidateId));
    
    let totalImported = 0;
    let totalRaised = 0;
    let hasMore = true;
    let attempts = 0;
    // Safety limit: 50 attempts for normal mode, 500 for unlimited (would be ~2 hours max)
    const maxAttempts = unlimitedAutoResume ? 500 : 50;
    let lastResult: FetchDonorsResult = { success: false, imported: 0 };
    let committeesSynced = 0;
    let fecItemizedTotal = 0;
    let localItemizedTotal = 0;
    
    try {
      // First, try to get FEC totals for progress estimation
      const { data: reconcData } = await supabase
        .from('finance_reconciliation')
        .select('fec_itemized, local_itemized')
        .eq('candidate_id', candidateId)
        .eq('cycle', cycle)
        .maybeSingle();
      
      fecItemizedTotal = reconcData?.fec_itemized || 0;
      localItemizedTotal = reconcData?.local_itemized || 0;
      
      while (hasMore && attempts < maxAttempts) {
        attempts++;
        
        // Calculate estimated progress based on local vs FEC itemized
        const estimatedProgress = fecItemizedTotal > 0 
          ? Math.min(95, Math.round((localItemizedTotal / fecItemizedTotal) * 100))
          : 0;
        
        setSyncProgress({
          candidateId,
          candidateName,
          committeesSynced,
          committeesTotal: committeesSynced + (lastResult.committeesRemaining || 1),
          donorsImported: totalImported,
          isComplete: false,
          localItemized: localItemizedTotal,
          fecItemized: fecItemizedTotal,
          estimatedProgress,
          attempts,
          isAutoResuming: unlimitedAutoResume,
          isWaitingForRateLimit: false
        });
        
        const result = await fetchFECDonorsSingle(candidateId, fecCandidateId, cycle, forceFullSync && attempts === 1);
        lastResult = result;
        
        // Check if we hit rate limit - update progress to show waiting status
        if (result.hitRateLimit) {
          const waitSeconds = Math.round((result.rateLimitWaitMs || 15000) / 1000);
          setSyncProgress(prev => prev ? {
            ...prev,
            isWaitingForRateLimit: true,
            rateLimitWaitSeconds: waitSeconds
          } : null);
          console.log(`[FEC-DONORS] Rate limit hit, waiting ${waitSeconds}s...`);
        }
        
        if (!result.success && result.error) {
          console.error(`[FEC-DONORS] Failed on attempt ${attempts}:`, result.error);
          setPartialSyncIds(prev => new Set(prev).add(candidateId));
          setSyncProgress(null);
          return { ...result, imported: totalImported, totalRaised };
        }
        
        totalImported += result.imported || 0;
        totalRaised += result.totalRaised || 0;
        hasMore = result.hasMore === true;
        
        // Update local itemized from reconciliation data if available
        if (result.reconciliation?.localItemized) {
          localItemizedTotal = result.reconciliation.localItemized;
        }
        
        if (result.committeesSynced) {
          committeesSynced++;
        }
        
        console.log(`[FEC-DONORS] Attempt ${attempts}: imported ${result.imported}, hasMore=${hasMore}, progress=${fecItemizedTotal > 0 ? Math.round((localItemizedTotal / fecItemizedTotal) * 100) : 0}%`);
        
        // Small delay between calls to be nice to the API
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // Update partial sync state
      if (hasMore) {
        setPartialSyncIds(prev => new Set(prev).add(candidateId));
      } else {
        setPartialSyncIds(prev => {
          const next = new Set(prev);
          next.delete(candidateId);
          return next;
        });
        
        // Trigger finance reconciliation when sync is complete (use internal to avoid loading state)
        console.log(`[FEC-DONORS] Sync complete for ${candidateName}, triggering reconciliation...`);
        try {
          const reconcileResult = await triggerReconciliationInternal(candidateId, cycle);
          if (reconcileResult.success) {
            console.log(`[FEC-DONORS] Reconciliation complete for ${candidateName}:`, reconcileResult.status);
          } else {
            console.warn(`[FEC-DONORS] Reconciliation failed for ${candidateName}:`, reconcileResult.error);
          }
        } catch (reconcileErr) {
          console.warn(`[FEC-DONORS] Reconciliation error for ${candidateName}:`, reconcileErr);
        }
      }

      const finalProgress = fecItemizedTotal > 0 
        ? Math.round((localItemizedTotal / fecItemizedTotal) * 100)
        : (hasMore ? 50 : 100);

      setSyncProgress({
        candidateId,
        candidateName,
        committeesSynced,
        committeesTotal: committeesSynced,
        donorsImported: totalImported,
        isComplete: !hasMore,
        localItemized: localItemizedTotal,
        fecItemized: fecItemizedTotal,
        estimatedProgress: hasMore ? finalProgress : 100,
        attempts,
        isAutoResuming: unlimitedAutoResume
      });

      return {
        success: true,
        imported: totalImported,
        totalRaised,
        hasMore,
        message: hasMore 
          ? `Partial sync: ${totalImported} donors (~${finalProgress}% complete). ${unlimitedAutoResume ? 'Auto-resuming...' : 'Call again to continue.'}`
          : `Complete: imported ${totalImported} donors totaling $${totalRaised.toLocaleString()}`,
        reconciliation: lastResult.reconciliation
      };
    } catch (err) {
      console.error('[FEC-DONORS] Complete fetch exception:', err);
      setPartialSyncIds(prev => new Set(prev).add(candidateId));
      return { success: false, imported: totalImported, totalRaised, error: 'Failed to complete donor sync', hasMore: true };
    } finally {
      setDonorLoadingIds(prev => {
        const next = new Set(prev);
        next.delete(candidateId);
        return next;
      });
      // Clear sync progress after a short delay so user sees final state
      setTimeout(() => setSyncProgress(null), 2000);
    }
  };

  // Auto-resume a single candidate until truly complete (wrapper that calls fetchFECDonorsComplete in unlimited mode)
  const autoResumeSingleCandidate = async (
    candidateId: string,
    fecCandidateId: string,
    candidateName: string,
    cycle = '2024'
  ): Promise<FetchDonorsResult> => {
    toast.info(`Starting auto-resume for ${candidateName}. This may take several minutes for high-volume candidates.`);
    return fetchFECDonorsComplete(candidateId, fecCandidateId, candidateName, cycle, false, true);
  };

  // Force re-sync: clears existing contributions and re-imports with proper cycle filtering
  // Use this to fix cycle mismatch issues (e.g., Katie Boyd Britt bug)
  const forceResyncDonors = async (
    candidateId: string,
    fecCandidateId: string,
    candidateName: string,
    cycle = '2024'
  ): Promise<FetchDonorsResult> => {
    setDonorLoadingIds(prev => new Set(prev).add(candidateId));
    
    try {
      toast.info(`Clearing existing contributions for ${candidateName}...`);
      
      // Step 1: Delete existing contributions for this candidate and cycle
      const { error: deleteContribError } = await supabase
        .from('contributions')
        .delete()
        .eq('candidate_id', candidateId)
        .eq('cycle', cycle);
      
      if (deleteContribError) {
        console.error('[FORCE-RESYNC] Failed to delete contributions:', deleteContribError);
        toast.error('Failed to clear contributions');
        return { success: false, imported: 0, error: deleteContribError.message };
      }
      
      // Step 2: Delete existing donors for this candidate and cycle
      const { error: deleteDonorError } = await supabase
        .from('donors')
        .delete()
        .eq('candidate_id', candidateId)
        .eq('cycle', cycle);
      
      if (deleteDonorError) {
        console.error('[FORCE-RESYNC] Failed to delete donors:', deleteDonorError);
        toast.error('Failed to clear donors');
        return { success: false, imported: 0, error: deleteDonorError.message };
      }
      
      // Step 3: Reset committee sync cursors to force full sync
      const { error: resetCursorError } = await supabase
        .from('candidate_committees')
        .update({
          last_index: null,
          last_contribution_date: null,
          last_sync_completed_at: null,
          has_more: false,
          local_itemized_total: 0
        })
        .eq('candidate_id', candidateId);
      
      if (resetCursorError) {
        console.warn('[FORCE-RESYNC] Failed to reset cursors:', resetCursorError);
        // Continue anyway - the forceFullSync flag will handle this
      }
      
      // Step 4: Clear reconciliation data
      const { error: deleteReconcError } = await supabase
        .from('finance_reconciliation')
        .delete()
        .eq('candidate_id', candidateId)
        .eq('cycle', cycle);
      
      if (deleteReconcError) {
        console.warn('[FORCE-RESYNC] Failed to clear reconciliation:', deleteReconcError);
        // Continue anyway
      }
      
      toast.success(`Cleared old data. Starting fresh sync for ${candidateName}...`);
      
      // Step 5: Trigger fresh sync with forceFullSync=true
      // Release loading state before calling fetchFECDonorsComplete (it will set its own)
      setDonorLoadingIds(prev => {
        const next = new Set(prev);
        next.delete(candidateId);
        return next;
      });
      
      return fetchFECDonorsComplete(candidateId, fecCandidateId, candidateName, cycle, true, true);
    } catch (err) {
      console.error('[FORCE-RESYNC] Exception:', err);
      setDonorLoadingIds(prev => {
        const next = new Set(prev);
        next.delete(candidateId);
        return next;
      });
      return { success: false, imported: 0, error: 'Force re-sync failed' };
    }
  };

  // Trigger finance reconciliation for a specific candidate (internal, no loading state)
  const triggerReconciliationInternal = async (candidateId: string, cycle = '2024'): Promise<{ success: boolean; status?: string; error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('nightly-finance-reconciliation', {
        body: { candidateId, cycle, limit: 1, onlyStale: false, onlyWithData: false }
      });

      if (error) {
        console.error('[RECONCILIATION] Invoke error:', error);
        return { success: false, error: error.message };
      }

      // Check for success flag first - if present, the function completed successfully
      if (data?.success) {
        const detail = data?.details?.[0];
        const status = detail?.status || 'completed';
        
        // Return status with variance info if there was a data issue (not a function failure)
        if (status === 'error' && detail) {
          return { 
            success: true, 
            status: `Variance: ${detail.individualDeltaPct?.toFixed(1) || 0}% individual, ${detail.pacDeltaPct?.toFixed(1) || 0}% PAC`
          };
        }
        
        return { success: true, status };
      }

      // Only treat as error if no success flag and there's a string error message
      if (data?.error && typeof data.error === 'string') {
        return { success: false, error: data.error };
      }

      // Fallback for unexpected response format
      return { success: false, error: 'Unexpected response format' };
    } catch (err) {
      console.error('[RECONCILIATION] Exception:', err);
      return { success: false, error: 'Failed to trigger reconciliation' };
    }
  };

  // Trigger finance reconciliation with loading state tracking (for UI buttons)
  const triggerReconciliation = async (candidateId: string, cycle = '2024'): Promise<{ success: boolean; status?: string; error?: string }> => {
    setReconcileLoadingIds(prev => new Set(prev).add(candidateId));
    try {
      return await triggerReconciliationInternal(candidateId, cycle);
    } finally {
      setReconcileLoadingIds(prev => {
        const next = new Set(prev);
        next.delete(candidateId);
        return next;
      });
    }
  };

  // Batch reconciliation for all candidates with FEC data
  const runBatchReconciliation = async (cycle = '2024', limit = 100): Promise<{ success: number; failed: number; warnings: number }> => {
    try {
      const { data, error } = await supabase.functions.invoke('nightly-finance-reconciliation', {
        body: { cycle, limit, onlyWithData: true, onlyStale: false }
      });

      if (error) {
        console.error('[BATCH-RECONCILIATION] Invoke error:', error);
        return { success: 0, failed: 1, warnings: 0 };
      }

      if (data?.success) {
        const details = data.details || [];
        const success = details.filter((d: { status: string }) => d.status === 'ok').length;
        const warnings = details.filter((d: { status: string }) => d.status === 'warning').length;
        const failed = details.filter((d: { status: string }) => d.status === 'error').length;
        return { success, failed, warnings };
      }

      return { success: 0, failed: 1, warnings: 0 };
    } catch (err) {
      console.error('[BATCH-RECONCILIATION] Exception:', err);
      return { success: 0, failed: 1, warnings: 0 };
    }
  };

  // Legacy single-call version for backwards compatibility
  const fetchFECDonors = async (
    candidateId: string,
    fecCandidateId: string,
    cycle = '2024',
    forceFullSync = false
  ): Promise<FetchDonorsResult> => {
    setDonorLoadingIds(prev => new Set(prev).add(candidateId));
    
    try {
      const result = await fetchFECDonorsSingle(candidateId, fecCandidateId, cycle, forceFullSync);
      
      // Track partial sync state
      if (result.hasMore) {
        setPartialSyncIds(prev => new Set(prev).add(candidateId));
      } else {
        setPartialSyncIds(prev => {
          const next = new Set(prev);
          next.delete(candidateId);
          return next;
        });
      }

      return result;
    } finally {
      setDonorLoadingIds(prev => {
        const next = new Set(prev);
        next.delete(candidateId);
        return next;
      });
    }
  };

  const batchFetchFECIds = async (
    candidates: Array<{ id: string; name: string; state: string }>
  ) => {
    const results = { success: 0, failed: 0 };
    
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      setBatchProgress({
        current: i + 1,
        total: candidates.length,
        currentName: candidate.name
      });

      const result = await fetchFECCandidateId(
        candidate.id,
        candidate.name,
        candidate.state,
        true
      );

      if (result.found && result.updated) {
        results.success++;
      } else {
        results.failed++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setBatchProgress(null);
    return results;
  };

  const batchFetchDonors = async (
    candidates: Array<{ id: string; name: string; fecCandidateId: string }>,
    cycle = '2024'
  ) => {
    const results = { success: 0, failed: 0, totalImported: 0, totalRaised: 0 };
    
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      setBatchProgress({
        current: i + 1,
        total: candidates.length,
        currentName: candidate.name
      });

      // Use complete fetch which auto-loops
      const result = await fetchFECDonorsComplete(
        candidate.id,
        candidate.fecCandidateId,
        candidate.name,
        cycle
      );

      if (result.success) {
        results.success++;
        results.totalImported += result.imported;
        results.totalRaised += result.totalRaised || 0;
      } else {
        results.failed++;
      }

      // Small delay between candidates
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setBatchProgress(null);
    return results;
  };

  const resumeAllPartialSyncs = async (
    candidates: Array<{ id: string; name: string; fecCandidateId: string }>,
    cycle = '2024'
  ) => {
    const results = { resumed: 0, completed: 0, stillPartial: 0, totalImported: 0, totalRaised: 0 };
    
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      setBatchProgress({
        current: i + 1,
        total: candidates.length,
        currentName: `Resuming: ${candidate.name}`
      });

      // Use complete fetch which auto-loops until done
      const result = await fetchFECDonorsComplete(
        candidate.id,
        candidate.fecCandidateId,
        candidate.name,
        cycle
      );

      results.totalImported += result.imported;
      results.totalRaised += result.totalRaised || 0;
      results.resumed++;
      
      if (!result.hasMore) {
        results.completed++;
      } else {
        results.stillPartial++;
      }

      // Delay between candidates
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setBatchProgress(null);
    return results;
  };

  // Sync All Candidates Until Complete - runs continuously until all donors imported
  const syncAllCandidatesComplete = async (cycle = '2024') => {
    if (syncAllProgress?.isRunning) {
      console.warn('[FEC] syncAllCandidatesComplete already running');
      return;
    }

    cancelSyncAllRef.current = false;
    
    const startTime = Date.now();
    setSyncAllProgress({
      candidatesCompleted: 0,
      candidatesTotal: 0,
      currentCandidate: 'Loading candidates...',
      totalDonorsImported: 0,
      totalRaised: 0,
      errors: [],
      isRunning: true,
      startTime
    });

    try {
      // Query candidates that need sync:
      // 1. Has fec_candidate_id
      // 2. Either: last_donor_sync is null OR has committees with has_more = true
      const { data: candidatesNeedingSync, error } = await supabase
        .from('candidates')
        .select(`
          id,
          name,
          fec_candidate_id,
          last_donor_sync
        `)
        .not('fec_candidate_id', 'is', null)
        .order('name');

      if (error) {
        console.error('[FEC] Error fetching candidates:', error);
        setSyncAllProgress(prev => prev ? { ...prev, isRunning: false, errors: [...prev.errors, error.message] } : null);
        return;
      }

      // Also get committees with has_more = true (incomplete syncs)
      const { data: incompleteCommittees } = await supabase
        .from('candidate_committees')
        .select('candidate_id')
        .eq('has_more', true);

      const incompleteCandidateIds = new Set(incompleteCommittees?.map(c => c.candidate_id) || []);

      // Filter to candidates that need work: never synced OR incomplete
      const toProcess = (candidatesNeedingSync || []).filter(c => 
        !c.last_donor_sync || incompleteCandidateIds.has(c.id)
      );

      if (toProcess.length === 0) {
        toast.info('All candidates are already fully synced!');
        setSyncAllProgress(null);
        return;
      }

      setSyncAllProgress(prev => prev ? { ...prev, candidatesTotal: toProcess.length } : null);
      
      let totalDonors = 0;
      let totalRaised = 0;
      const errors: string[] = [];

      for (let i = 0; i < toProcess.length; i++) {
        // Check cancel flag
        if (cancelSyncAllRef.current) {
          console.log('[FEC] Sync cancelled by user');
          setSyncAllProgress(prev => prev ? { ...prev, isRunning: false, currentCandidate: 'Cancelled' } : null);
          toast.info(`Sync cancelled after ${i} candidates`);
          return;
        }

        const candidate = toProcess[i];
        
        setSyncAllProgress(prev => prev ? {
          ...prev,
          candidatesCompleted: i,
          currentCandidate: candidate.name,
        } : null);

        try {
          const result = await fetchFECDonorsComplete(
            candidate.id,
            candidate.fec_candidate_id!,
            candidate.name,
            cycle,
            false // Don't force full sync - resume from where we left off
          );

          totalDonors += result.imported || 0;
          totalRaised += result.totalRaised || 0;

          setSyncAllProgress(prev => prev ? {
            ...prev,
            totalDonorsImported: totalDonors,
            totalRaised: totalRaised,
          } : null);

          if (!result.success && result.error) {
            errors.push(`${candidate.name}: ${result.error}`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`${candidate.name}: ${msg}`);
        }

        // Small delay between candidates
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      setSyncAllProgress(prev => prev ? {
        ...prev,
        isRunning: false,
        candidatesCompleted: toProcess.length,
        currentCandidate: 'Complete!',
        errors
      } : null);

      const elapsed = Math.round((Date.now() - startTime) / 1000 / 60);
      toast.success(
        `Sync complete! Imported ${totalDonors.toLocaleString()} donors ` +
        `($${totalRaised.toLocaleString()}) for ${toProcess.length} candidates in ${elapsed} minutes`
      );

    } catch (err) {
      console.error('[FEC] syncAllCandidatesComplete failed:', err);
      setSyncAllProgress(prev => prev ? { ...prev, isRunning: false } : null);
      toast.error('Sync all failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const cancelSyncAll = () => {
    cancelSyncAllRef.current = true;
  };

  const clearSyncAllProgress = () => {
    setSyncAllProgress(null);
  };

  // Refresh FEC totals for a single candidate (lightweight, no contribution sync)
  const refreshFECTotals = async (
    candidateId: string,
    cycle = '2024'
  ): Promise<{ success: boolean; fecItemized?: number; deltaPct?: number; error?: string }> => {
    setTotalsLoadingIds(prev => new Set(prev).add(candidateId));
    
    try {
      const { data, error } = await supabase.functions.invoke('refresh-fec-totals', {
        body: { candidateId, cycle }
      });

      if (error) {
        console.error('[REFRESH-FEC-TOTALS] Invoke error:', error);
        return { success: false, error: error.message };
      }

      if (data?.error) {
        return { success: false, error: String(data.error) };
      }

      return { 
        success: true, 
        fecItemized: data?.fecItemized,
        deltaPct: data?.deltaPct
      };
    } catch (err) {
      console.error('[REFRESH-FEC-TOTALS] Exception:', err);
      return { success: false, error: 'Failed to refresh FEC totals' };
    } finally {
      setTotalsLoadingIds(prev => {
        const next = new Set(prev);
        next.delete(candidateId);
        return next;
      });
    }
  };

  // Batch refresh FEC totals for multiple candidates
  const batchRefreshFECTotals = async (
    candidateIds: string[],
    cycle = '2024'
  ): Promise<{ success: number; failed: number; skipped: number }> => {
    setTotalsProgress({ current: 0, total: candidateIds.length });
    
    try {
      const { data, error } = await supabase.functions.invoke('refresh-fec-totals', {
        body: { batch: true, candidateIds, cycle }
      });

      if (error) {
        console.error('[REFRESH-FEC-TOTALS] Batch invoke error:', error);
        return { success: 0, failed: candidateIds.length, skipped: 0 };
      }

      return {
        success: data?.processed || 0,
        failed: data?.failed || 0,
        skipped: data?.skipped || 0
      };
    } catch (err) {
      console.error('[REFRESH-FEC-TOTALS] Batch exception:', err);
      return { success: 0, failed: candidateIds.length, skipped: 0 };
    } finally {
      setTotalsProgress(null);
    }
  };

  return {
    fetchFECCandidateId,
    fetchFECCommittees,
    fetchFECDonors,
    fetchFECDonorsComplete,
    autoResumeSingleCandidate,
    batchFetchFECIds,
    batchFetchDonors,
    resumeAllPartialSyncs,
    syncAllCandidatesComplete,
    cancelSyncAll,
    clearSyncAllProgress,
    triggerReconciliation,
    runBatchReconciliation,
    forceResyncDonors,
    refreshFECTotals,
    batchRefreshFECTotals,
    isLoading,
    isDonorLoading,
    isCommitteeLoading,
    isReconcileLoading,
    isTotalsLoading,
    hasPartialSync,
    partialSyncIds,
    batchProgress,
    syncProgress,
    syncAllProgress,
    totalsProgress,
    isBatchRunning: batchProgress !== null,
    isSyncAllRunning: syncAllProgress?.isRunning === true,
    isTotalsRefreshing: totalsProgress !== null,
    highVolumeMode,
    setHighVolumeMode
  };
}
