import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BackfillProgress = {
  status: "running" | "complete" | "error" | "cancelled";
  processed: number;
  total: number;
  successful: number;
  failed: number;
  currentCandidate?: string;
  startedAt?: string;
  completedAt?: string;
  elapsedMinutes?: number;
  error?: string;
  failures?: { id: string; name: string; error: string }[];
};

export function useBackfillAnswersProgress() {
  return useQuery({
    queryKey: ["backfill-answers-progress"],
    queryFn: async (): Promise<BackfillProgress | null> => {
      const { data } = await supabase
        .from("admin_stats_cache")
        .select("stat_value")
        .eq("stat_key", "backfill_answers_progress")
        .maybeSingle();
      return (data?.stat_value as BackfillProgress) ?? null;
    },
    refetchInterval: (q) => {
      const v = q.state.data as BackfillProgress | null;
      return v?.status === "running" ? 5000 : 30000;
    },
  });
}
