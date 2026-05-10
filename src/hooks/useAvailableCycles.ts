import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns the list of election cycles available for a candidate, plus a
 * sensible default (newest cycle). Always includes at least the current
 * federal cycle and the previous one so the picker is never empty.
 */
export function useAvailableCycles(candidateId: string | undefined | null) {
  return useQuery({
    queryKey: ['available-cycles', candidateId],
    queryFn: async (): Promise<{ cycles: string[]; defaultCycle: string }> => {
      const baseline = computeBaselineCycles();
      const set = new Set<string>(baseline);

      if (candidateId) {
        const [{ data: donorCycles }, { data: committees }, { data: contribCycles }] =
          await Promise.all([
            supabase
              .from('donors')
              .select('cycle')
              .eq('candidate_id', candidateId)
              .limit(2000),
            supabase
              .from('candidate_committees')
              .select('cycles')
              .eq('candidate_id', candidateId),
            supabase
              .from('contributions')
              .select('cycle')
              .eq('candidate_id', candidateId)
              .limit(2000),
          ]);

        donorCycles?.forEach((d) => d.cycle && set.add(String(d.cycle)));
        contribCycles?.forEach((d) => d.cycle && set.add(String(d.cycle)));
        committees?.forEach((c) =>
          (c.cycles || []).forEach((cy: string) => cy && set.add(String(cy))),
        );
      }

      const cycles = Array.from(set).sort((a, b) => Number(b) - Number(a));
      return { cycles, defaultCycle: cycles[0] };
    },
    staleTime: 1000 * 60 * 30,
  });
}

function computeBaselineCycles(): string[] {
  const year = new Date().getFullYear();
  // Federal cycles are even years; surface the current and previous one.
  const currentCycle = year % 2 === 0 ? year : year + 1;
  return [String(currentCycle), String(currentCycle - 2)];
}
