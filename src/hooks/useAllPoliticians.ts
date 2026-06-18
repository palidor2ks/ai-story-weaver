import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Representative {
  id: string;
  name: string;
  party: 'Democrat' | 'Republican' | 'Independent' | 'Other';
  office: string;
  state: string;
  district: string | null;
  image_url: string;
  is_incumbent: boolean;
  bioguide_id: string;
  overall_score: number | null;
  coverage_tier: string;
  confidence: string;
}

interface FetchAllResponse {
  representatives: Representative[];
  total: number;
  error?: string;
}

const LS_KEY = 'all-politicians-v1';
const LS_TTL = 1000 * 60 * 60; // 1 hour

function readLocalCache(): Representative[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: Representative[]; ts: number };
    if (Date.now() - ts > LS_TTL || !Array.isArray(data) || data.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

function writeLocalCache(data: Representative[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // quota exceeded or private browsing — silently skip
  }
}

export function useAllPoliticians(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  return useQuery({
    queryKey: ['all-politicians'],
    queryFn: async (): Promise<Representative[]> => {
      const cached = readLocalCache();
      if (cached) {
        console.log(`[Cache] all-politicians from localStorage: ${cached.length}`);
        return cached;
      }

      console.log('Fetching all Congress members from edge function...');
      const { data, error } = await supabase.functions.invoke<FetchAllResponse>(
        'fetch-representatives',
        { body: { fetchAll: true } }
      );

      if (error) {
        console.error('Error fetching all politicians:', error);
        throw error;
      }
      if (data?.error) {
        console.error('API error:', data.error);
        return [];
      }

      const result = data?.representatives || [];
      console.log(`Fetched ${result.length} Congress members`);
      writeLocalCache(result);
      return result;
    },
    enabled,
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });
}
