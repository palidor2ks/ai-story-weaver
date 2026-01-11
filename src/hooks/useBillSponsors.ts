import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SponsoredBill {
  bill_id: string;
  bill_name: string;
  bill_type: string | null;
  bill_number: number | null;
  congress: number | null;
  topic: string | null;
  status: string | null;
  is_sponsor: boolean;
  sponsorship_date: string | null;
  url: string | null;
}

export function useBillSponsors(bioguideId: string | undefined) {
  return useQuery({
    queryKey: ['bill-sponsors', bioguideId],
    queryFn: async (): Promise<SponsoredBill[]> => {
      if (!bioguideId) return [];
      
      const { data, error } = await supabase
        .from('bill_sponsors')
        .select(`
          bill_id,
          is_sponsor,
          sponsorship_date,
          bills!inner (
            name,
            bill_type,
            bill_number,
            congress,
            topic,
            status,
            url
          )
        `)
        .eq('bioguide_id', bioguideId)
        .order('is_sponsor', { ascending: false })
        .order('sponsorship_date', { ascending: false });
      
      if (error) throw error;
      
      return (data || []).map(row => ({
        bill_id: row.bill_id,
        bill_name: row.bills.name,
        bill_type: row.bills.bill_type,
        bill_number: row.bills.bill_number,
        congress: row.bills.congress,
        topic: row.bills.topic,
        status: row.bills.status,
        is_sponsor: row.is_sponsor ?? false,
        sponsorship_date: row.sponsorship_date,
        url: row.bills.url,
      }));
    },
    enabled: !!bioguideId,
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}
