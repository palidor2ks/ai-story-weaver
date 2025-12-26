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
  const [partialSyncIds, setPartialSyncIds] = useState<Set<string>>(new Set());
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    currentName: string;
  } | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncAllProgress, setSyncAllProgress] = useState<SyncAllProgress | null>(null);
  const cancelSyncAllRef = useRef(false);

  const isLoading = (candidateId: string) => loadingIds.has(candidateId);
  const isDonorLoading = (candidateId: string) => donorLoadingIds.has(candidateId);
  const isCommitteeLoading = (candidateId: string) => committeeLoadingIds.has(candidateId);
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
    forceFullSync = false
  ): Promise<FetchDonorsResult> => {
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

      const { data, error } = await supabase.functions.invoke('fetch-fec-donors', {
        body: { candidateId, fecCandidateId, cycle, forceFullSync }
      });

      // Handle Supabase invoke error (network/auth/function 4xx/5xx)
      if (error) {
        console.error('[FEC-DONORS] Invoke error:', error);
        return { success: false, imported: 0, error: normalizeInvokeError(error), hasMore: false };
      }

      // Handle edge function returning an error in the response body
      if (data?.error) {
        console.warn('[FEC-DONORS] Function returned error:', data.error);
        return { success: false, imported: 0, error: String(data.error), hasMore: false };
      }

      // Success
      return data as FetchDonorsResult;
    } catch (err) {
      console.error('[FEC-DONORS] Exception:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch donors';
      return { success: false, imported: 0, error: normalizeInvokeError(errorMessage), hasMore: false };
    }
  };

  // Complete fetch: loops until hasMore=false
  const fetchFECDonorsComplete = async (
    candidateId: string,
    fecCandidateId: string,
    candidateName: string,
    cycle = '2024',
    forceFullSync = false
  ): Promise<FetchDonorsResult> => {
    setDonorLoadingIds(prev => new Set(prev).add(candidateId));
    
    let totalImported = 0;
    let totalRaised = 0;
    let hasMore = true;
    let attempts = 0;
    const maxAttempts = 50; // Safety limit (50 * 25s = ~20min max per candidate)
    let lastResult: FetchDonorsResult = { success: false, imported: 0 };
    let committeesSynced = 0;
    
    try {
      while (hasMore && attempts < maxAttempts) {
        attempts++;
        
        setSyncProgress({
          candidateId,
          candidateName,
          committeesSynced,
          committeesTotal: committeesSynced + (lastResult.committeesRemaining || 1),
          donorsImported: totalImported,
          isComplete: false
        });
        
        const result = await fetchFECDonorsSingle(candidateId, fecCandidateId, cycle, forceFullSync && attempts === 1);
        lastResult = result;
        
        if (!result.success && result.error) {
          console.error(`[FEC-DONORS] Failed on attempt ${attempts}:`, result.error);
          setPartialSyncIds(prev => new Set(prev).add(candidateId));
          setSyncProgress(null);
          return { ...result, imported: totalImported, totalRaised };
        }
        
        totalImported += result.imported || 0;
        totalRaised += result.totalRaised || 0;
        hasMore = result.hasMore === true;
        
        if (result.committeesSynced) {
          committeesSynced++;
        }
        
        console.log(`[FEC-DONORS] Attempt ${attempts}: imported ${result.imported}, hasMore=${hasMore}, remaining=${result.committeesRemaining}`);
        
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
      }

      setSyncProgress({
        candidateId,
        candidateName,
        committeesSynced,
        committeesTotal: committeesSynced,
        donorsImported: totalImported,
        isComplete: !hasMore
      });

      return {
        success: true,
        imported: totalImported,
        totalRaised,
        hasMore,
        message: hasMore 
          ? `Partial sync: ${totalImported} donors imported so far. Call again to continue.`
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

  return {
    fetchFECCandidateId,
    fetchFECCommittees,
    fetchFECDonors,
    fetchFECDonorsComplete,
    batchFetchFECIds,
    batchFetchDonors,
    resumeAllPartialSyncs,
    syncAllCandidatesComplete,
    cancelSyncAll,
    clearSyncAllProgress,
    isLoading,
    isDonorLoading,
    isCommitteeLoading,
    hasPartialSync,
    partialSyncIds,
    batchProgress,
    syncProgress,
    syncAllProgress,
    isBatchRunning: batchProgress !== null,
    isSyncAllRunning: syncAllProgress?.isRunning === true
  };
}
