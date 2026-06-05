import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CronJobHealth {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  totalRuns: number;
  succeeded: number;
  failed: number;
  lastRun: string | null;
  lastStatus: string | null;
  avgDurationSeconds: number | null;
}

export interface CronJobFailure {
  runid: number;
  startTime: string | null;
  endTime: string | null;
  status: string;
  returnMessage: string | null;
}

export interface PipelineFailureSummary {
  source: string;
  label: string;
  failureCount: number;
  lastFailedAt: string | null;
}

export interface PipelineFailure {
  repId: string;
  repName: string;
  state: string | null;
  cycle: string | null;
  reason: string | null;
  occurredAt: string | null;
}

/** pg_cron run history: attempts & failures per scheduled job over `days`. */
export function useCronJobHealth(days = 7) {
  return useQuery({
    queryKey: ["cron-job-health", days],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CronJobHealth[]> => {
      const { data, error } = await supabase.rpc("get_cron_job_health", { p_days: days });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        jobid: Number(r.jobid),
        jobname: r.jobname,
        schedule: r.schedule,
        active: !!r.active,
        totalRuns: Number(r.total_runs) || 0,
        succeeded: Number(r.succeeded) || 0,
        failed: Number(r.failed) || 0,
        lastRun: r.last_run ?? null,
        lastStatus: r.last_status ?? null,
        avgDurationSeconds:
          r.avg_duration_seconds === null || r.avg_duration_seconds === undefined
            ? null
            : Number(r.avg_duration_seconds),
      }));
    },
  });
}

/** Recent failed pg_cron runs for one job (the raw Postgres error messages). */
export function useCronJobFailures(jobname: string | null) {
  return useQuery({
    queryKey: ["cron-job-failures", jobname],
    enabled: !!jobname,
    queryFn: async (): Promise<CronJobFailure[]> => {
      const { data, error } = await supabase.rpc("get_cron_job_failures", {
        p_jobname: jobname!,
        p_limit: 25,
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        runid: Number(r.runid),
        startTime: r.start_time ?? null,
        endTime: r.end_time ?? null,
        status: r.status,
        returnMessage: r.return_message ?? null,
      }));
    },
  });
}

/** Rolled-up rep-level failure counts per pipeline source. */
export function usePipelineFailureSummary() {
  return useQuery({
    queryKey: ["pipeline-failure-summary"],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<PipelineFailureSummary[]> => {
      const { data, error } = await supabase.rpc("get_pipeline_failure_summary");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        source: r.source,
        label: r.label,
        failureCount: Number(r.failure_count) || 0,
        lastFailedAt: r.last_failed_at ?? null,
      }));
    },
  });
}

/** The individual reps that failed for a given pipeline source (which + why). */
export function usePipelineFailures(source: string | null) {
  return useQuery({
    queryKey: ["pipeline-failures", source],
    enabled: !!source,
    queryFn: async (): Promise<PipelineFailure[]> => {
      const { data, error } = await supabase.rpc("get_pipeline_failures", {
        p_source: source!,
        p_limit: 200,
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        repId: r.rep_id,
        repName: r.rep_name,
        state: r.state ?? null,
        cycle: r.cycle ?? null,
        reason: r.reason ?? null,
        occurredAt: r.occurred_at ?? null,
      }));
    },
  });
}
