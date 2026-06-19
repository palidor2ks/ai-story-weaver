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

interface CdnPayload {
  generatedAt: string;
  version: number;
  candidates: unknown[];
  congressMembers: Representative[];
}

const CDN_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/data-cache/candidates-directory.json`;
const CDN_MAX_AGE_MS = 26 * 60 * 60 * 1000; // 26 hours

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

function normalizeParty(p: string): Representative['party'] {
  if (p === 'Democrat' || p === 'Republican' || p === 'Independent') return p;
  return 'Other';
}

export function useAllPoliticians(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  return useQuery({
    queryKey: ['all-politicians'],
    queryFn: async (): Promise<Representative[]> => {
      // 1. Try localStorage first (~0 ms — same browser session)
      const cached = readLocalCache();
      if (cached) {
        console.log(`[Cache] all-politicians from localStorage: ${cached.length}`);
        return cached;
      }

      // 2. Try CDN (~50 ms — pre-baked JSON, no cold start, shared across all users)
      try {
        const cdnRes = await fetch(CDN_URL);
        if (cdnRes.ok) {
          const json = await cdnRes.json() as CdnPayload;
          const age = Date.now() - new Date(json.generatedAt).getTime();
          if (age < CDN_MAX_AGE_MS && Array.isArray(json.congressMembers) && json.congressMembers.length > 0) {
            const result: Representative[] = json.congressMembers.map(m => ({
              ...m,
              party: normalizeParty(m.party),
            }));
            console.log(`[CDN] congress members: ${result.length} (age ${Math.round(age / 60000)}m)`);
            writeLocalCache(result);
            return result;
          }
        }
      } catch {
        // network error — fall through to DB
      }

      // 3. Try DB cache (~100 ms — congress_members table, no edge-function cold start)
      console.log('[DB] Fetching Congress members from congress_members table...');
      const { data: dbRows, error: dbError } = await supabase.rpc('get_all_congress_members');

      if (!dbError && dbRows && dbRows.length > 0) {
        console.log(`[DB] Got ${dbRows.length} Congress members from DB cache`);
        const result: Representative[] = dbRows.map(r => ({
          id: r.bioguide_id,
          bioguide_id: r.bioguide_id,
          name: r.name,
          party: normalizeParty(r.party),
          office: r.office,
          state: r.state,
          district: r.district,
          image_url: r.image_url,
          is_incumbent: r.is_incumbent,
          overall_score: r.overall_score ?? null,
          coverage_tier: r.coverage_tier,
          confidence: r.confidence,
        }));
        writeLocalCache(result);
        return result;
      }

      if (dbError) {
        console.warn('[DB] congress_members RPC failed, falling back to edge function:', dbError.message);
      } else {
        console.log('[DB] congress_members cache is empty or stale, falling back to edge function');
      }

      // 4. Edge function fallback (2-4 s cold start, populates DB for next user)
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
      console.log(`Fetched ${result.length} Congress members from edge function`);
      writeLocalCache(result);
      return result;
    },
    enabled,
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });
}
