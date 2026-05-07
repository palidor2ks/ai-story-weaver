import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ProcessingJob {
  candidateId: string;
  candidateName: string;
  questionsQueued: number;
  questionIds: string[];
  startTime: number;
  estimatedMinutes: number;
  baselineTimestamps: Map<string, string | null>;
  completedCount: number;
  lastProgressAt: number; // Track when progress last changed
  isStalled: boolean;
}

interface BackgroundProcessingContextType {
  isProcessing: boolean;
  jobs: ProcessingJob[];
  addJob: (job: {
    candidateId: string;
    candidateName: string;
    questionsQueued: number;
    questionIds: string[];
    estimatedMinutes: number;
  }) => Promise<void>;
  removeJob: (candidateId: string) => void;
  clearAllJobs: () => void;
  retryJob: (candidateId: string) => void;
}

const BackgroundProcessingContext = createContext<BackgroundProcessingContextType | null>(null);

const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes with no progress = stalled
const AUTO_DISMISS_MS = 30 * 60 * 1000; // 30 minutes with no progress = auto-dismiss

export function BackgroundProcessingProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const queryClient = useQueryClient();
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const addJob = useCallback(async (job: {
    candidateId: string;
    candidateName: string;
    questionsQueued: number;
    questionIds: string[];
    estimatedMinutes: number;
  }) => {
    console.log(`[BackgroundProcessing] Adding job for ${job.candidateName}:`, job.questionIds);
    
    // Fetch current updated_at for each question to establish baseline
    const { data: existingAnswers } = await supabase
      .from('candidate_answers')
      .select('question_id, updated_at')
      .eq('candidate_id', job.candidateId)
      .in('question_id', job.questionIds);

    const baselineTimestamps = new Map<string, string | null>();
    job.questionIds.forEach(qId => {
      const existing = existingAnswers?.find(a => a.question_id === qId);
      baselineTimestamps.set(qId, existing?.updated_at || null);
    });

    console.log(`[BackgroundProcessing] Baseline timestamps for ${job.candidateName}:`, 
      Object.fromEntries(baselineTimestamps));

    setJobs(prev => {
      // Replace existing job for same candidate
      const filtered = prev.filter(j => j.candidateId !== job.candidateId);
      return [...filtered, { 
        ...job, 
        startTime: Date.now(),
        baselineTimestamps,
        completedCount: 0,
        lastProgressAt: Date.now(),
        isStalled: false,
      }];
    });
  }, []);

  const removeJob = useCallback((candidateId: string) => {
    setJobs(prev => prev.filter(j => j.candidateId !== candidateId));
  }, []);

  const clearAllJobs = useCallback(() => {
    setJobs([]);
  }, []);

  const retryJob = useCallback((candidateId: string) => {
    const job = jobs.find(j => j.candidateId === candidateId);
    if (!job) return;
    
    // Remove the stalled job - user can click "Regenerate Topics" again
    // which will only generate missing answers (the ones that weren't completed)
    removeJob(candidateId);
    toast.info(`Cleared stalled job for ${job.candidateName}. Click "Regenerate Topics" to resume remaining questions.`);
  }, [jobs, removeJob]);

  // Poll for completion every 15 seconds when jobs are active
  useEffect(() => {
    if (jobs.length === 0) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    const checkCompletion = async () => {
      const jobsToRemove: string[] = [];
      const jobUpdates: { candidateId: string; completedCount: number; isStalled: boolean }[] = [];
      
      for (const job of jobs) {
        try {
          // Fetch current answers for the tracked questions
          const { data: currentAnswers } = await supabase
            .from('candidate_answers')
            .select('question_id, updated_at')
            .eq('candidate_id', job.candidateId)
            .in('question_id', job.questionIds);

          // Count how many have been updated (either new or updated_at changed)
          let completedCount = 0;
          for (const qId of job.questionIds) {
            const current = currentAnswers?.find(a => a.question_id === qId);
            const baseline = job.baselineTimestamps.get(qId);
            
            // Complete if: new answer exists OR updated_at changed
            if (current && (!baseline || current.updated_at !== baseline)) {
              completedCount++;
            }
          }

          const elapsed = (Date.now() - job.startTime) / 60000;
          const timeSinceProgress = Date.now() - job.lastProgressAt;
          
          console.log(`[BackgroundProcessing] Checking ${job.candidateName}: ${completedCount}/${job.questionsQueued} complete, elapsed ${elapsed.toFixed(1)}min`);

          // Detect stall: no progress for STALE_THRESHOLD_MS
          const progressChanged = completedCount !== job.completedCount;
          const isStalled = !progressChanged && timeSinceProgress > STALE_THRESHOLD_MS && completedCount < job.questionsQueued;

          // Auto-dismiss after AUTO_DISMISS_MS with no progress
          if (!progressChanged && timeSinceProgress > AUTO_DISMISS_MS && completedCount < job.questionsQueued) {
            console.log(`[BackgroundProcessing] Auto-dismissing stalled job for ${job.candidateName} (${completedCount}/${job.questionsQueued}, no progress for ${Math.round(timeSinceProgress / 60000)}min)`);
            toast.warning(`Research for ${job.candidateName} appears stalled`, {
              description: `${completedCount}/${job.questionsQueued} completed. Click "Regenerate Topics" to resume.`,
            });
            jobsToRemove.push(job.candidateId);
            continue;
          }

          // Track progress updates
          jobUpdates.push({ 
            candidateId: job.candidateId, 
            completedCount,
            isStalled,
          });
          
          // Job complete if all questions updated
          const allComplete = completedCount >= job.questionsQueued;
          
          if (allComplete) {
            toast.success(`Research complete for ${job.candidateName}!`, {
              description: `${completedCount} answer${completedCount !== 1 ? 's' : ''} updated`,
              action: {
                label: 'Refresh',
                onClick: () => queryClient.invalidateQueries({ 
                  queryKey: ['candidate-answers-dialog', job.candidateId] 
                }),
              },
            });
            
            jobsToRemove.push(job.candidateId);
            queryClient.invalidateQueries({ queryKey: ['candidate-answers-dialog', job.candidateId] });
            queryClient.invalidateQueries({ queryKey: ['candidates-answer-coverage'] });
          }
        } catch (error) {
          console.error(`[BackgroundProcessing] Error checking job for ${job.candidateName}:`, error);
        }
      }
      
      // Update progress counts
      if (jobUpdates.length > 0) {
        setJobs(prev => prev.map(j => {
          const update = jobUpdates.find(u => u.candidateId === j.candidateId);
          if (!update) return j;
          const progressChanged = update.completedCount !== j.completedCount;
          return { 
            ...j, 
            completedCount: update.completedCount,
            lastProgressAt: progressChanged ? Date.now() : j.lastProgressAt,
            isStalled: update.isStalled,
          };
        }));
      }
      
      // Remove completed/dismissed jobs
      if (jobsToRemove.length > 0) {
        setJobs(prev => prev.filter(j => !jobsToRemove.includes(j.candidateId)));
      }
    };

    // Run immediately on mount and then every 15 seconds
    checkCompletion();
    pollIntervalRef.current = setInterval(checkCompletion, 15000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [jobs, queryClient]);

  return (
    <BackgroundProcessingContext.Provider value={{
      isProcessing: jobs.length > 0,
      jobs,
      addJob,
      removeJob,
      clearAllJobs,
      retryJob,
    }}>
      {children}
    </BackgroundProcessingContext.Provider>
  );
}

export function useBackgroundProcessing() {
  const context = useContext(BackgroundProcessingContext);
  if (!context) {
    throw new Error('useBackgroundProcessing must be used within BackgroundProcessingProvider');
  }
  return context;
}
