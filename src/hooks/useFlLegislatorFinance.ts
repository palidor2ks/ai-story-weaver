import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FlMatchedEntity {
  entity_s: string;
  entity_name: string;
  party: string | null;
  office: string | null;
  location: string | null;
  election_year: number | null;
  election_type: string | null;
  total: number;
  n: number;
}

export interface FlTopContributor {
  contributor: string;
  contributor_type: string | null;
  is_individual: boolean;
  total: number;
  n: number;
  emp_name: string | null;
  occupation: string | null;
}

export interface FlLegislatorFinance {
  matched_entities: FlMatchedEntity[];
  total_raised: number;
  contribution_count: number;
  election_years: number[];
  top_contributors: FlTopContributor[];
}

interface Params {
  name?: string | null;
  district?: string | null;
  office?: string | null;
  state?: string | null;
  level?: string | null;
}

/**
 * True when this official is a FL state legislator (State Representative / State
 * Senator). Excludes federal offices (U.S. House/Senate from FL) so the FEC
 * pipeline owns those — the FL Division of Elections dataset is state-only.
 */
export function isFlStateLegislator({ state, office, level }: Params): boolean {
  if (state !== 'FL' || !office || level === 'federal') return false;
  const o = office.toLowerCase();
  // Federal offices ("U.S. Representative"/"U.S. Senator" contain "repres"/"senat").
  if (/\bu\.?\s*s\.?\b|united states|congress/.test(o)) return false;
  return /senat/.test(o) || /repres/.test(o) || /\bhouse\b/.test(o) || /assembl/.test(o);
}

/**
 * Campaign-finance summary for a FL state legislator, sourced from the FL
 * Division of Elections (state-level data the FEC does not cover). Name/district/
 * chamber matching to FL contributions happens server-side in the
 * fl_legislator_finance() RPC, so the client just passes the identifying fields.
 */
export function useFlLegislatorFinance(params: Params) {
  const { name, district, office } = params;
  const enabled = !!name && isFlStateLegislator(params);

  return useQuery({
    queryKey: ['fl-legislator-finance', name, district, office],
    enabled,
    staleTime: 1000 * 60 * 60,
    queryFn: async (): Promise<FlLegislatorFinance | null> => {
      // RPC isn't in the generated types yet; cast to keep this self-contained.
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>)('fl_legislator_finance', {
        p_name: name,
        p_district: district ?? null,
        p_office: office ?? null,
      });
      if (error) throw error;
      return (data as FlLegislatorFinance) ?? null;
    },
  });
}
