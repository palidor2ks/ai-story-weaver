import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Per (org, cycle) "donated by or through" rollup for earmark-program orgs
// (e.g. AIPAC): direct = the org's own countable dollars; routed = memo-X
// attribution dollars, which are ALREADY counted under the individual donors.
// Routed money is a display lens — never add it into list/category totals.
// Conduit processors (ActBlue/WinRed/Democracy Engine) are excluded by the RPC.
export interface EarmarkRollup {
  org_label: string;
  org_type: string;
  cycle: string;
  direct_amount: number;
  direct_count: number;
  routed_amount: number;
  routed_count: number;
}

export const useCandidateEarmarkRollups = (candidateId: string | undefined, cycle?: string) => {
  return useQuery({
    queryKey: ['earmark-rollups', candidateId, cycle ?? 'all'],
    queryFn: async (): Promise<EarmarkRollup[]> => {
      if (!candidateId) return [];
      // Untyped RPC cast: same pattern as useDonorsPaginated (types regenerate
      // after the migration lands).
      const { data, error } = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
      }).rpc('get_candidate_earmark_rollups', {
        p_candidate_id: candidateId,
        p_cycle: cycle && cycle !== 'all' ? cycle : null,
      });
      if (error) {
        // Fail soft ONLY while the RPC doesn't exist yet (it ships in a
        // migration applied after this code deploys). Anything else is a real
        // failure — throw so React Query retries instead of caching [].
        const missingFn =
          error.code === 'PGRST202' ||
          error.code === '42883' ||
          /could not find the function|does not exist/i.test(error.message);
        if (!missingFn) throw new Error(error.message);
        console.warn('[earmark-rollups] RPC not deployed yet:', error.message);
        return [];
      }
      const rows = Array.isArray(data) ? data : [];
      return rows
        .map((row) => {
          const r = row as Record<string, unknown>;
          return {
            org_label: String(r.org_label ?? ''),
            org_type: String(r.org_type ?? 'Unknown'),
            cycle: String(r.cycle ?? ''),
            direct_amount: Number(r.direct_amount) || 0,
            direct_count: Number(r.direct_count) || 0,
            routed_amount: Number(r.routed_amount) || 0,
            routed_count: Number(r.routed_count) || 0,
          };
        })
        .filter((r) => r.org_label && r.routed_amount > 0);
    },
    enabled: !!candidateId,
  });
};
