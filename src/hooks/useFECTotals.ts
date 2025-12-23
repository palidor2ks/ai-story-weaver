import { useQuery } from '@tanstack/react-query';

interface FECTotals {
  total_receipts: number;
  individual_itemized_contributions: number;
  individual_unitemized_contributions: number;
  other_receipts: number;
  total_disbursements: number;
  cash_on_hand_end_period: number;
  coverage_end_date: string | null;
}

export const useFECTotals = (committeeId: string | null | undefined, cycle: string = '2024') => {
  return useQuery({
    queryKey: ['fec-totals', committeeId, cycle],
    queryFn: async (): Promise<FECTotals | null> => {
      if (!committeeId) return null;

      // Use demo key - production should use environment variable through edge function
      // For now we'll make a direct call since this is read-only public data
      const url = `https://api.open.fec.gov/v1/committee/${committeeId}/totals/?api_key=DEMO_KEY&cycle=${cycle}&per_page=1`;
      
      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.warn('[FEC Totals] API error:', response.status);
          return null;
        }
        
        const data = await response.json();
        const result = data.results?.[0];
        
        if (!result) return null;
        
        return {
          total_receipts: result.receipts || 0,
          individual_itemized_contributions: result.individual_itemized_contributions || 0,
          individual_unitemized_contributions: result.individual_unitemized_contributions || 0,
          other_receipts: result.other_receipts || 0,
          total_disbursements: result.disbursements || 0,
          cash_on_hand_end_period: result.cash_on_hand_end_period || 0,
          coverage_end_date: result.coverage_end_date || null,
        };
      } catch (err) {
        console.error('[FEC Totals] Fetch error:', err);
        return null;
      }
    },
    enabled: !!committeeId,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
    retry: 1,
  });
};
