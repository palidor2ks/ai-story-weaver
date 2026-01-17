import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ProcessingJob {
  candidateId: string;
  candidateName: string;
  questionsQueued: number;
  startTime: number;
  estimatedMinutes: number;
}

interface ProcessingStatus {
  isProcessing: boolean;
  jobs: ProcessingJob[];
  addJob: (job: Omit<ProcessingJob, 'startTime'>) => void;
  removeJob: (candidateId: string) => void;
  clearAllJobs: () => void;
}

export function useBackgroundProcessingStatus(): ProcessingStatus {
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const queryClient = useQueryClient();
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousAnswerCountsRef = useRef<Map<string, number>>(new Map());

  const addJob = useCallback((job: Omit<ProcessingJob, 'startTime'>) => {
    // Store the current answer count before starting
    supabase
      .from('candidate_answers')
      .select('*', { count: 'exact', head: true })
      .eq('candidate_id', job.candidateId)
      .then(({ count }) => {
        previousAnswerCountsRef.current.set(job.candidateId, count || 0);
      });
    
    setJobs(prev => {
      // Replace existing job for same candidate
      const filtered = prev.filter(j => j.candidateId !== job.candidateId);
      return [...filtered, { ...job, startTime: Date.now() }];
    });
  }, []);

  const removeJob = useCallback((candidateId: string) => {
    setJobs(prev => prev.filter(j => j.candidateId !== candidateId));
    previousAnswerCountsRef.current.delete(candidateId);
  }, []);

  const clearAllJobs = useCallback(() => {
    setJobs([]);
    previousAnswerCountsRef.current.clear();
  }, []);

  // Poll for completion every 30 seconds when jobs are active
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
      
      for (const job of jobs) {
        try {
          // Check if new answers have been added
          const { count } = await supabase
            .from('candidate_answers')
            .select('*', { count: 'exact', head: true })
            .eq('candidate_id', job.candidateId);

          const previousCount = previousAnswerCountsRef.current.get(job.candidateId) || 0;
          const currentCount = count || 0;
          const newAnswers = currentCount - previousCount;

          // Calculate elapsed time
          const elapsed = (Date.now() - job.startTime) / 60000;
          
          // Job is complete if:
          // - We have at least as many new answers as questions queued
          // - OR elapsed time exceeds estimated time by 20%
          // - OR we have new answers and elapsed > 80% of estimate
          const hasAllAnswers = newAnswers >= job.questionsQueued;
          const timedOut = elapsed >= job.estimatedMinutes * 1.2;
          const likelyComplete = newAnswers > 0 && elapsed >= job.estimatedMinutes * 0.8;
          
          if (hasAllAnswers || timedOut || likelyComplete) {
            const message = hasAllAnswers 
              ? `${newAnswers} new answers added`
              : timedOut 
                ? `Processing complete (${newAnswers} answers added)`
                : `Research finished (${newAnswers} answers added)`;
            
            toast.success(`Research complete for ${job.candidateName}!`, {
              description: message,
              action: {
                label: 'Refresh',
                onClick: () => {
                  queryClient.invalidateQueries({ queryKey: ['candidate-answers-dialog', job.candidateId] });
                },
              },
            });
            
            jobsToRemove.push(job.candidateId);
            
            // Invalidate relevant queries
            queryClient.invalidateQueries({ queryKey: ['candidate-answers-dialog', job.candidateId] });
            queryClient.invalidateQueries({ queryKey: ['candidates-answer-coverage'] });
          } else if (newAnswers > 0) {
            // Update the previous count to track incremental progress
            previousAnswerCountsRef.current.set(job.candidateId, currentCount);
          }
        } catch (error) {
          console.error(`[BackgroundStatus] Error checking job for ${job.candidateName}:`, error);
        }
      }
      
      // Remove completed jobs
      if (jobsToRemove.length > 0) {
        setJobs(prev => prev.filter(j => !jobsToRemove.includes(j.candidateId)));
        jobsToRemove.forEach(id => previousAnswerCountsRef.current.delete(id));
      }
    };

    // Run immediately on mount and then every 30 seconds
    checkCompletion();
    pollIntervalRef.current = setInterval(checkCompletion, 30000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [jobs, queryClient]);

  return {
    isProcessing: jobs.length > 0,
    jobs,
    addJob,
    removeJob,
    clearAllJobs,
  };
}
