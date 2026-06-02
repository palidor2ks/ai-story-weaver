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

const MAX_LOOKAHEAD_DAYS = 550;

function toElectionTime(date: string): number {
  const t = new Date(`${date}T00:00:00`).getTime();
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

function normalizeNameKey(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[,.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((token) => token && !['jr', 'sr', 'ii', 'iii', 'iv', 'mr', 'mrs', 'ms', 'dr'].includes(token))
    .sort()
    .join(' ');
}

function normalizeDistrictKey(district: string | null | undefined): string {
  return String(district || '').replace(/^0+/, '').toLowerCase();
}

function officeBucket(office: string): string {
  const value = (office || '').toLowerCase();
  if (/president|white house/.test(value)) return 'president';
  if (/governor/.test(value)) return 'governor';
  if (/state\s+senate|state senator/.test(value)) return 'state-senate';
  if (/state\s+(assembly|house|representative|delegate|legislature)/.test(value)) return 'state-house';
  if (/u\.?s\.?\s+senate|us senate|senator/.test(value)) return 'senate';
  if (/u\.?s\.?\s+house|us house|congress|representative/.test(value)) return 'house';
  if (/mayor/.test(value)) return 'mayor';
  if (/council|alder|select(wo)?man|commissioner|freeholder/.test(value)) return 'local-council';
  return value.replace(/\s+/g, ' ').trim() || 'other';
}

function candidatePersonKey(candidate: UpcomingCandidate): string {
  return [
    normalizeNameKey(candidate.name),
    (candidate.state || '').toLowerCase(),
    officeBucket(candidate.office),
    normalizeDistrictKey(candidate.district),
  ].join('|');
}

function chooseCandidate(current: UpcomingCandidate, next: UpcomingCandidate): UpcomingCandidate {
  const currentRank = Number(current.image_url ? 1 : 0) + Number(!current.is_pending_research ? 2 : 0) + Number(current.overall_score !== null ? 4 : 0);
  const nextRank = Number(next.image_url ? 1 : 0) + Number(!next.is_pending_research ? 2 : 0) + Number(next.overall_score !== null ? 4 : 0);
  return nextRank > currentRank ? next : current;
}

function dedupeCandidates(candidates: UpcomingCandidate[]): UpcomingCandidate[] {
  const byPerson = new Map<string, UpcomingCandidate>();
  for (const candidate of candidates) {
    const key = candidatePersonKey(candidate);
    const existing = byPerson.get(key);
    byPerson.set(key, existing ? chooseCandidate(existing, candidate) : candidate);
  }
  return Array.from(byPerson.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeUpcomingElections(data: UpcomingElectionsResult): UpcomingElectionsResult {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + MAX_LOOKAHEAD_DAYS);

  const allRows = [...data.federal, ...data.state, ...data.local]
    .filter((row) => {
      const d = new Date(`${row.election_date}T00:00:00`);
      return d >= today && d <= maxDate;
    })
    .sort((a, b) => toElectionTime(a.election_date) - toElectionTime(b.election_date));

  const nextDate = allRows[0]?.election_date;
  if (!nextDate) return EMPTY;

  const seenRaces = new Set<string>();
  const nextRows = allRows
    .filter((row) => row.election_date === nextDate)
    .map((row) => ({ ...row, candidates: dedupeCandidates(row.candidates) }))
    .filter((row) => row.candidates.length > 0)
    .filter((row) => {
      const offices = Array.from(new Set(row.candidates.map((c) => officeBucket(c.office)))).sort().join(',');
      const parties = Array.from(new Set(row.candidates.map((c) => c.party))).sort().join(',');
      const raceKey = [row.election_date, row.election_type.toLowerCase(), row.level, row.jurisdiction ?? '', offices, parties].join('|').toLowerCase();
      if (seenRaces.has(raceKey)) return false;
      seenRaces.add(raceKey);
      return true;
    });

  return {
    federal: nextRows.filter((e) => e.level === 'federal'),
    state: nextRows.filter((e) => e.level === 'state'),
    local: nextRows.filter((e) => e.level === 'local'),
  };
}
export function useUpcomingElections(address: string | null | undefined) {
  const geocodeQuery = useGeocode(address);
  const geocode = geocodeQuery.data;
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const queryKey = ['upcoming-elections', geocode?.state, geocode?.district, 'next-election-v2'];

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
      return normalizeUpcomingElections(data ?? EMPTY);
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
