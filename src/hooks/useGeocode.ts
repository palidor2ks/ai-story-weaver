import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GeocodeResult {
  district: string | null;
  state: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  matchedAddress?: string | null;
  ward?: string | null;
  divisions?: string[];
}

/**
 * Shared geocode hook. Both useRepresentatives and useCivicOfficials depend on
 * this so the address is geocoded ONCE per session per address (then served
 * from React Query + the server-side civic_lookup_cache table).
 */
export function useGeocode(address: string | null | undefined) {
  return useQuery({
    queryKey: ['geocode', address],
    queryFn: async (): Promise<GeocodeResult | null> => {
      if (!address) return null;
      const { data, error } = await supabase.functions.invoke<GeocodeResult & { error?: string }>(
        'geocode-address',
        { body: { address } }
      );
      if (error) {
        console.error('[useGeocode] Edge function error:', error);
        return null;
      }
      if (data?.error) {
        console.warn('[useGeocode] Geocode API error:', data.error);
      }
      return {
        district: data?.district ?? null,
        state: data?.state ?? null,
        city: data?.city ?? null,
        lat: data?.lat ?? null,
        lng: data?.lng ?? null,
        matchedAddress: data?.matchedAddress ?? null,
      };
    },
    enabled: !!address,
    staleTime: 1000 * 60 * 60, // 1 hour client-side cache
    retry: 1,
  });
}
