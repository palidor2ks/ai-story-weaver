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
  source: string;
  source_url: string | null;
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

function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeJurisdictionKey(jurisdiction: string | null | undefined, state: string | null | undefined): string {
  let normalized = normalizeText(jurisdiction);
  if (!normalized) return normalizeText(state);

  normalized = normalized
    .replace(/\btownship of\b/g, '')
    .replace(/\bcity of\b/g, '')
    .replace(/\bborough of\b/g, '')
    .replace(/\btown of\b/g, '')
    .replace(/\bvillage of\b/g, '')
    .replace(/\btownship\b/g, '')
    .replace(/,?\s*[a-z\s]+county\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || normalizeText(state);
}

function candidateKey(candidate: UpcomingCandidate): string {
  const name = normalizeText(candidate.name);
  const office = normalizeText(candidate.office);
  const party = normalizeText(candidate.party);
  const state = normalizeText(candidate.state);
  const district = normalizeText(candidate.district);

  return [name, party, office, state, district].join('|');
}

function mergeCandidate(existing: UpcomingCandidate, incoming: UpcomingCandidate): UpcomingCandidate {
  return {
    ...existing,
    ...incoming,
    candidate_id: existing.candidate_id || incoming.candidate_id,
    image_url: existing.image_url ?? incoming.image_url,
    overall_score: existing.overall_score ?? incoming.overall_score,
    confidence: existing.confidence ?? incoming.confidence,
    answers_source: existing.answers_source ?? incoming.answers_source,
    source_url: existing.source_url ?? incoming.source_url,
    is_incumbent: existing.is_incumbent || incoming.is_incumbent,
    is_pending_research: existing.is_pending_research && incoming.is_pending_research,
    office: incoming.office.length > existing.office.length ? incoming.office : existing.office,
    district: existing.district ?? incoming.district,
  };
}

function mergeCandidates(candidates: UpcomingCandidate[]): UpcomingCandidate[] {
  const byId = new Map<string, UpcomingCandidate>();
  const bySignature = new Map<string, string>();

  for (const candidate of candidates) {
    const signature = candidateKey(candidate);
    const existingId = byId.has(candidate.candidate_id)
      ? candidate.candidate_id
      : bySignature.get(signature);

    if (!existingId) {
      byId.set(candidate.candidate_id, candidate);
      bySignature.set(signature, candidate.candidate_id);
      continue;
    }

    const merged = mergeCandidate(byId.get(existingId)!, candidate);
    byId.set(existingId, merged);
    bySignature.set(signature, existingId);
  }

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function mergeElection(existing: UpcomingElection, incoming: UpcomingElection): UpcomingElection {
  const candidates = mergeCandidates([...existing.candidates, ...incoming.candidates]);

  return {
    ...existing,
    name: incoming.name.length > existing.name.length ? incoming.name : existing.name,
    jurisdiction: existing.jurisdiction ?? incoming.jurisdiction,
    state: existing.state ?? incoming.state,
    source: existing.source.includes(incoming.source) ? existing.source : `${existing.source}, ${incoming.source}`,
    candidates,
  };
}

function normalizeUpcomingElections(data: UpcomingElectionsResult): UpcomingElectionsResult {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + MAX_LOOKAHEAD_DAYS);

  const toTime = (date: string) => {
    const t = new Date(`${date}T00:00:00`).getTime();
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
  };

  const filterAndDedupe = (rows: UpcomingElection[]) => {
    const byElection = new Map<string, UpcomingElection>();

    for (const row of rows) {
      const d = new Date(`${row.election_date}T00:00:00`);
      if (d < today || d > maxDate) continue;

      const key = [
        row.election_date,
        normalizeText(row.election_type),
        row.level,
        normalizeJurisdictionKey(row.jurisdiction, row.state),
      ].join('|');

      const normalizedRow = { ...row, candidates: mergeCandidates(row.candidates) };
      const existing = byElection.get(key);
      byElection.set(key, existing ? mergeElection(existing, normalizedRow) : normalizedRow);
    }

    return Array.from(byElection.values()).sort((a, b) => toTime(a.election_date) - toTime(b.election_date));
  };

  return {
    federal: filterAndDedupe(data.federal),
    state: filterAndDedupe(data.state),
    local: filterAndDedupe(data.local),
  };
}

export function useUpcomingElections(address: string | null | undefined) {
  const geocodeQuery = useGeocode(address);
  const geocode = geocodeQuery.data;
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const queryKey = ['upcoming-elections', geocode?.state, geocode?.district, geocode?.city, geocode?.ward, 'v4'];

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
            city: geocode.city ?? undefined,
            ward: geocode.ward ?? undefined,
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
          city: geocode.city ?? undefined,
          ward: geocode.ward ?? undefined,
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
