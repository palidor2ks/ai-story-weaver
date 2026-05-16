import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the list of finance cycles present in the database
 * (union of candidate_committees.cycles and committee_finance_rollups.cycle),
 * sorted descending. Falls back to a sensible default if the RPC returns empty.
 */
export function useFinanceCycles() {
  return useQuery({
    queryKey: ['finance-cycles'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc('get_committee_cycles');
      if (error) throw error;
      const cycles = ((data as string[] | null) ?? [])
        .filter(Boolean)
        .map((c) => String(c));
      if (cycles.length === 0) return ['2026', '2024'];
      // RPC already sorts desc, but enforce just in case
      return [...new Set(cycles)].sort((a, b) => b.localeCompare(a));
    },
  });
}
