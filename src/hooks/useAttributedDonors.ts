import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AttributedDonor {
  donor_id: string;
  donor_name: string;
  display_name: string;
  donor_type: 'Individual' | 'PAC' | 'Organization' | 'Unknown';
  donation_amount: number;
  committee_id: string;
  candidate_id: string;
  candidate_name: string;
  cycle: string;
  impact_type: 'support' | 'oppose';
  support_ratio: number;
  oppose_ratio: number;
  attributed_support_amount: number;
  attributed_oppose_amount: number;
}

export function useAttributedDonors(candidateId: string | undefined, cycle: string = '2024') {
  return useQuery({
    queryKey: ['attributed-donors', candidateId, cycle],
    queryFn: async () => {
      if (!candidateId) return { supporting: [], opposing: [] };

      const { data, error } = await supabase
        .from('donor_attributed_impact')
        .select('*')
        .eq('candidate_id', candidateId)
        .eq('cycle', cycle)
        .order('attributed_support_amount', { ascending: false, nullsFirst: false });

      if (error) throw error;

      const donors = (data || []) as AttributedDonor[];

      // Split by impact type and aggregate by donor across PACs
      const supportMap = new Map<string, AttributedDonor & { totalAttributed: number }>();
      const opposeMap = new Map<string, AttributedDonor & { totalAttributed: number }>();

      for (const donor of donors) {
        const supportAmount = donor.attributed_support_amount || 0;
        const opposeAmount = donor.attributed_oppose_amount || 0;

        if (supportAmount > 0) {
          const key = donor.donor_id;
          if (supportMap.has(key)) {
            const existing = supportMap.get(key)!;
            existing.totalAttributed += supportAmount;
            existing.donation_amount += donor.donation_amount;
          } else {
            supportMap.set(key, {
              ...donor,
              totalAttributed: supportAmount,
            });
          }
        }

        if (opposeAmount > 0) {
          const key = donor.donor_id;
          if (opposeMap.has(key)) {
            const existing = opposeMap.get(key)!;
            existing.totalAttributed += opposeAmount;
            existing.donation_amount += donor.donation_amount;
          } else {
            opposeMap.set(key, {
              ...donor,
              totalAttributed: opposeAmount,
            });
          }
        }
      }

      // Sort by attributed amount
      const supporting = Array.from(supportMap.values())
        .sort((a, b) => b.totalAttributed - a.totalAttributed)
        .slice(0, 20);

      const opposing = Array.from(opposeMap.values())
        .sort((a, b) => b.totalAttributed - a.totalAttributed)
        .slice(0, 20);

      return { supporting, opposing };
    },
    enabled: !!candidateId,
  });
}

export function usePacDonors(committeeId: string | undefined, cycle: string = '2024') {
  return useQuery({
    queryKey: ['pac-donors', committeeId, cycle],
    queryFn: async () => {
      if (!committeeId) return [];

      const { data, error } = await supabase
        .from('donors')
        .select('*')
        .eq('recipient_committee_id', committeeId)
        .eq('cycle', cycle)
        .is('candidate_id', null) // PAC donors have null candidate_id
        .order('amount', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
    enabled: !!committeeId,
  });
}
