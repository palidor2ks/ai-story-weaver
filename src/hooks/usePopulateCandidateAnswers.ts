import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface PopulateResult {
  success: boolean;
  candidateId: string;
  generated?: number;
  existing?: number;
  missingBefore?: number;
  failedChunks?: number;
  error?: string;
}

interface BatchProgress {
  total: number;
  completed: number;
  currentName: string;
  errors: number;
  retrying: boolean;
  retryCount: number;
  paused: boolean;
}

interface QueueItem {
  id: string;
  name: string;
  retryCount: number;
  forceRegenerate: boolean;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 3000; // Start with 3 seconds
const WORKER_LIMIT_DELAY_MS = 10000; // 10 seconds for worker limit errors

export function usePopulateCandidateAnswers() {
  const [loadingCandidates, setLoadingCandidates] = useState<Record<string, boolean>>({});
  const [loadingQuestions, setLoadingQuestions] = useState<Record<string, boolean>>({});
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const queryClient = useQueryClient();
  
  // Queue management
  const queueRef = useRef<QueueItem[]>([]);
  const isProcessingRef = useRef(false);
  const isPausedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const populateCandidate = async (
    candidateId: string, 
    forceRegenerate = false,
    onBackgroundJobStarted?: (job: { questionsQueued: number; estimatedMinutes: number }) => void
  ): Promise<PopulateResult> => {
    setLoadingCandidates(prev => ({ ...prev, [candidateId]: true }));
    
    try {
      const { data, error } = await supabase.functions.invoke('get-candidate-answers', {
        body: { candidateId, forceRegenerate },
      });

      if (error) {
        throw new Error(error.message);
      }

      // Handle background processing response
      if (data?.status === 'processing') {
        toast.info(`Deep research started`, {
          description: `${data.questionsQueued || 'Multiple'} questions. Results in ~${data.estimatedMinutes || 3} minutes.`,
        });
        
        onBackgroundJobStarted?.({
          questionsQueued: data.questionsQueued || 0,
          estimatedMinutes: data.estimatedMinutes || 3,
        });
        
        return { 
          success: true, 
          candidateId, 
          generated: 0, 
          existing: 0, 
          missingBefore: data.questionsQueued || 0 
        };
      }

      const generated = data?.generated || 0;
      const existing = data?.existing || 0;
      const missingBefore = data?.missingBefore || 0;
      const failedChunks = data?.failedChunks || 0;
      const finalCount = data?.finalCount || 0;
      const totalQuestions = data?.totalQuestions || 0;
      
      if (generated > 0) {
        toast.success(`Generated ${generated} answers (${finalCount}/${totalQuestions} total)`);
      } else if (missingBefore > 0 && generated === 0) {
        toast.error(`Failed to generate ${missingBefore} missing answers - check logs`);
      } else if (missingBefore === 0 && existing > 0) {
        toast.info(`Already has all ${existing} answers`);
      } else {
        toast.info(`No answers generated`);
      }

      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['candidates-answer-coverage'] }),
        queryClient.refetchQueries({ queryKey: ['candidate-answer-stats'] }),
        queryClient.refetchQueries({ queryKey: ['candidate-answers'] }),
        queryClient.refetchQueries({ queryKey: ['sync-stats'] }),
      ]);

      return { success: generated > 0 || missingBefore === 0, candidateId, generated, existing, missingBefore, failedChunks };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate answers';
      toast.error(message);
      return { success: false, candidateId, error: message };
    } finally {
      setLoadingCandidates(prev => ({ ...prev, [candidateId]: false }));
    }
  };

  // Check if error is a worker limit error
  const isWorkerLimitError = (error: unknown): boolean => {
    const message = (error as { message?: string })?.message || String(error ?? '') || '';
    return message.includes('WORKER_LIMIT') || 
           message.includes('546') ||
           message.includes('compute resources');
  };

  // Process a single candidate with retry logic
  const processCandidate = async (
    item: QueueItem,
    onProgress: (update: Partial<BatchProgress>) => void
  ): Promise<{ success: boolean; shouldRetry: boolean }> => {
    try {
      const { data, error } = await supabase.functions.invoke('get-candidate-answers', {
        body: { candidateId: item.id, forceRegenerate: item.forceRegenerate },
      });

      if (error) {
        // Check for worker limit error
        if (isWorkerLimitError(error)) {
          console.warn(`Worker limit hit for ${item.name}, will retry...`);
          return { success: false, shouldRetry: true };
        }
        throw error;
      }

      // Check for worker limit in response
      if (data?.code === 'WORKER_LIMIT' || data?.error?.includes?.('WORKER_LIMIT')) {
        console.warn(`Worker limit in response for ${item.name}, will retry...`);
        return { success: false, shouldRetry: true };
      }

      const generated = data?.generated || 0;
      const missingBefore = data?.missingBefore || 0;
      
      return { 
        success: generated > 0 || missingBefore === 0, 
        shouldRetry: false 
      };
    } catch (error) {
      if (isWorkerLimitError(error)) {
        return { success: false, shouldRetry: true };
      }
      console.error(`Error processing ${item.name}:`, error);
      return { success: false, shouldRetry: false };
    }
  };

  // Main queue processor
  const processQueue = async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    let successCount = 0;
    let errorCount = 0;
    let processedCount = 0;
    const totalItems = queueRef.current.length;

    while (queueRef.current.length > 0) {
      // Check if paused
      if (isPausedRef.current) {
        setBatchProgress(prev => prev ? { ...prev, paused: true } : null);
        await new Promise(resolve => {
          const checkPause = setInterval(() => {
            if (!isPausedRef.current) {
              clearInterval(checkPause);
              resolve(undefined);
            }
          }, 500);
        });
        setBatchProgress(prev => prev ? { ...prev, paused: false } : null);
      }

      const item = queueRef.current[0];
      
      setBatchProgress({
        total: totalItems,
        completed: processedCount,
        currentName: item.name,
        errors: errorCount,
        retrying: item.retryCount > 0,
        retryCount: item.retryCount,
        paused: false,
      });

      const result = await processCandidate(item, (update) => {
        setBatchProgress(prev => prev ? { ...prev, ...update } : null);
      });

      if (result.success) {
        successCount++;
        processedCount++;
        queueRef.current.shift(); // Remove from queue
        
        // Standard delay between successful candidates
        if (queueRef.current.length > 0) {
          await new Promise(resolve => setTimeout(resolve, BASE_DELAY_MS));
        }
      } else if (result.shouldRetry && item.retryCount < MAX_RETRIES) {
        // Retry with exponential backoff
        item.retryCount++;
        const delay = WORKER_LIMIT_DELAY_MS * Math.pow(2, item.retryCount - 1);
        console.log(`Retrying ${item.name} in ${delay / 1000}s (attempt ${item.retryCount}/${MAX_RETRIES})`);
        
        setBatchProgress(prev => prev ? {
          ...prev,
          retrying: true,
          retryCount: item.retryCount,
        } : null);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // Failed after retries or non-retryable error
        errorCount++;
        processedCount++;
        queueRef.current.shift();
        console.error(`Failed to process ${item.name} after ${item.retryCount} retries`);
        
        // Extra delay after failure
        if (queueRef.current.length > 0) {
          await new Promise(resolve => setTimeout(resolve, BASE_DELAY_MS * 2));
        }
      }
    }

    // Finished processing
    isProcessingRef.current = false;
    setBatchProgress(null);

    // Refetch all relevant queries
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['candidates-answer-coverage'] }),
      queryClient.refetchQueries({ queryKey: ['candidate-answer-stats'] }),
      queryClient.refetchQueries({ queryKey: ['candidate-answers'] }),
      queryClient.refetchQueries({ queryKey: ['sync-stats'] }),
    ]);

    toast.success(
      `Batch complete: ${successCount} succeeded${errorCount > 0 ? `, ${errorCount} failed` : ''}`
    );

    return { success: successCount, errors: errorCount };
  };

  const populateBatch = async (
    candidates: Array<{ id: string; name: string }>,
    forceRegenerate = false
  ): Promise<{ success: number; errors: number }> => {
    // Add all candidates to queue
    queueRef.current = candidates.map(c => ({
      id: c.id,
      name: c.name,
      retryCount: 0,
      forceRegenerate,
    }));

    isPausedRef.current = false;
    abortControllerRef.current = new AbortController();

    setBatchProgress({
      total: candidates.length,
      completed: 0,
      currentName: candidates[0]?.name || '',
      errors: 0,
      retrying: false,
      retryCount: 0,
      paused: false,
    });

    return processQueue() as Promise<{ success: number; errors: number }>;
  };

  const pauseBatch = useCallback(() => {
    isPausedRef.current = true;
    setBatchProgress(prev => prev ? { ...prev, paused: true } : null);
  }, []);

  const resumeBatch = useCallback(() => {
    isPausedRef.current = false;
  }, []);

  const cancelBatch = useCallback(() => {
    queueRef.current = [];
    isPausedRef.current = false;
    isProcessingRef.current = false;
    abortControllerRef.current?.abort();
    setBatchProgress(null);
    toast.info('Batch processing cancelled');
  }, []);

  const getQueueLength = useCallback(() => queueRef.current.length, []);

  // Populate a single question for a candidate
  const populateCandidateQuestion = async (
    candidateId: string,
    questionId: string,
    candidateName?: string,
    onBackgroundJobStarted?: (job: { questionsQueued: number; estimatedMinutes: number; questionIds: string[] }) => void
  ): Promise<{ success: boolean; error?: string; isBackground?: boolean }> => {
    const loadingKey = `${candidateId}-${questionId}`;
    setLoadingQuestions(prev => ({ ...prev, [loadingKey]: true }));

    try {
      const { data, error } = await supabase.functions.invoke('get-candidate-answers', {
        body: { 
          candidateId, 
          questionIds: [questionId],
          forceRegenerate: true 
        },
      });

      if (error) throw new Error(error.message);

      // Handle background processing response
      if (data?.status === 'processing') {
        toast.info(`Deep research started for ${candidateName || 'candidate'}`, {
          description: `Results in ~${data.estimatedMinutes || 3} minutes`,
        });
        
        // Notify caller so they can add to job tracking
        onBackgroundJobStarted?.({
          questionsQueued: data.questionsQueued || 1,
          estimatedMinutes: data.estimatedMinutes || 3,
          questionIds: [questionId],
        });
        
        return { success: true, isBackground: true };
      }

      // Handle synchronous completion
      const generated = data?.generated || 0;
      
      if (generated > 0) {
        toast.success(`Regenerated answer for ${candidateName || 'candidate'}`);
      } else if (data?.missingBefore === 0) {
        toast.info('Answer already exists');
      } else {
        toast.warning('Research completed but no answer generated');
      }

      // Invalidate queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['candidate-topic-questions', candidateId] }),
        queryClient.invalidateQueries({ queryKey: ['candidates-answer-coverage'] }),
        queryClient.invalidateQueries({ queryKey: ['candidate-answers', candidateId] }),
        queryClient.invalidateQueries({ queryKey: ['candidate-answers-dialog', candidateId] }),
      ]);

      return { success: generated > 0 };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to regenerate answer';
      toast.error(message);
      return { success: false, error: message };
    } finally {
      setLoadingQuestions(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  const isLoading = (candidateId: string) => loadingCandidates[candidateId] || false;
  const isQuestionLoading = (candidateId: string, questionId: string) => 
    loadingQuestions[`${candidateId}-${questionId}`] || false;
  const isAnyLoading = Object.values(loadingCandidates).some(Boolean);
  const isBatchRunning = batchProgress !== null;

  return {
    populateCandidate,
    populateCandidateQuestion,
    populateBatch,
    pauseBatch,
    resumeBatch,
    cancelBatch,
    getQueueLength,
    isLoading,
    isQuestionLoading,
    isAnyLoading,
    isBatchRunning,
    batchProgress,
  };
}
