import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Map of committee FEC id -> total independent-expenditure amount, for the
// visible committee rows on the Committees page.
export function useCommitteeIeTotals(visibleIds: string[]) {
  return useQuery({
    queryKey: ['committees-ie-totals', visibleIds],
    enabled: visibleIds.length > 0,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('committee_independent_expenditure_totals')
        .select('spending_committee_fec_id, total_amount')
        .in('spending_committee_fec_id', visibleIds);
      const map = new Map<string, number>();
      (rows ?? []).forEach((r) => {
        if (r.spending_committee_fec_id) map.set(r.spending_committee_fec_id, Number(r.total_amount ?? 0));
      });
      return map;
    },
  });
}
