import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useGeocode } from './useGeocode';

export interface UpcomingCandidate {
  candidate_id: string;
  name: string;
  party: string;
  office: string;
  state: string;
  district: string | null;
  image_url: string | null;
  is_incumbent: boolean;
  overall_score: number | null;
  coverage_tier: string;
  confidence: string | null;
  answers_source: string | null;
  is_pending_research: boolean;
}

export interface UpcomingElection {
  id: string;
  election_date: string;
  election_type: string;
  level: 'federal' | 'state' | 'local';
  state: string | null;
  jurisdiction: string | null;
  name: string;
  source: string;
  candidates: UpcomingCandidate[];
}

export interface UpcomingElectionsResult {
  federal: UpcomingElection[];
  state: UpcomingElection[];
  local: UpcomingElection[];
}

const EMPTY: UpcomingElectionsResult = { federal: [], state: [], local: [] };

export function useUpcomingElections(address: string | null | undefined) {
  const geocodeQuery = useGeocode(address);
  const geocode = geocodeQuery.data;
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const queryKey = ['upcoming-elections', geocode?.state, geocode?.district, 'v1'];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<UpcomingElectionsResult> => {
      if (!address || !geocode?.state) return EMPTY;
      const { data, error } = await supabase.functions.invoke<UpcomingElectionsResult>(
        'fetch-upcoming-elections',
        {
          body: {
            address,
            state: geocode.state,
            district: geocode.district ?? null,
            lat: geocode.lat ?? undefined,
            lng: geocode.lng ?? undefined,
          },
        },
      );
      if (error) {
        console.error('[useUpcomingElections]', error);
        return EMPTY;
      }
      return data ?? EMPTY;
    },
    enabled: !!address && !!geocode?.state && !geocodeQuery.isLoading,
    staleTime: 1000 * 60 * 60, // 1h
    refetchInterval: (query) => {
      const data = query.state.data as UpcomingElectionsResult | undefined;
      if (!data) return false;
      const all = [...data.federal, ...data.state, ...data.local];
      const pending = all.some(e => e.candidates.some(c => c.is_pending_research));
      return pending ? 60_000 : false;
    },
    retry: 1,
  });

  const refresh = async (): Promise<{ ok: boolean; error?: string }> => {
    if (!address || !geocode?.state) {
      return { ok: false, error: 'Address not set' };
    }
    setIsRefreshing(true);
    try {
      const { error } = await supabase.functions.invoke('fetch-upcoming-elections', {
        body: {
          address,
          state: geocode.state,
          district: geocode.district ?? null,
          lat: geocode.lat ?? undefined,
          lng: geocode.lng ?? undefined,
          force: true,
        },
      });
      if (error) {
        console.error('[useUpcomingElections.refresh]', error);
        return { ok: false, error: error.message ?? 'Refresh failed' };
      }
      await queryClient.invalidateQueries({ queryKey });
      return { ok: true };
    } finally {
      setIsRefreshing(false);
    }
  };

  return { ...query, refresh, isRefreshing };
}
