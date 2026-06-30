import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface IngestRow {
  source: string;
  status: string;
  last_started_at: string | null;
  last_completed_at: string | null;
  last_total_fetched: number | null;
  last_total_new: number | null;
  last_page: number | null;
  error_message: string | null;
  cursor: Record<string, unknown> | null;
  updated_at: string | null;
}

export const REFRESH_MS = 15000;

export function useCandidateIngestStatus() {
  return useQuery({
    queryKey: ["candidate-ingest-status"],
    queryFn: async () => {
      // candidate_ingest_status isn't in the generated types yet, so cast the client.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("candidate_ingest_status")
        .select("*")
        .order("source");
      if (error) throw error;
      return (data ?? []) as IngestRow[];
    },
    refetchInterval: REFRESH_MS,
  });
}

export function useCandidateIngestCounts() {
  return useQuery({
    queryKey: ["candidate-ingest-counts"],
    queryFn: async () => {
      const total = await supabase.from("candidates").select("id", { count: "exact", head: true });
      const pending = await supabase
        .from("candidates")
        .select("id", { count: "exact", head: true })
        .eq("answers_source", "pending_research");
      return { total: total.count ?? 0, pending: pending.count ?? 0 };
    },
    refetchInterval: REFRESH_MS,
  });
}
