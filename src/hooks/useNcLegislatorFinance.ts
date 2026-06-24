import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface NcMatchedEntity {
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

export interface NcTopContributor {
  contributor: string;
  contributor_type: string | null;
  is_individual: boolean;
  total: number;
  n: number;
  emp_name: string | null;
  occupation: string | null;
}

export interface NcLegislatorFinance {
  matched_entities: NcMatchedEntity[];
  total_raised: number;
  contribution_count: number;
  election_years: number[];
  top_contributors: NcTopContributor[];
}

interface Params {
  name?: string | null;
  district?: string | null;
  office?: string | null;
  state?: string | null;
  level?: string | null;
}

/**
 * True when this official is a NC state legislator (State Senator / House member).
 * Excludes federal offices (U.S. Senate / U.S. House from NC) so the FEC pipeline
 * owns those — the NCSBE dataset is state-only.
 */
export function isNcStateLegislator({ state, office, level }: Params): boolean {
  if (state !== 'NC' || !office || level === 'federal') return false;
  const o = office.toLowerCase();
  if (/\bu\.?\s*s\.?\b|united states|congress/.test(o)) return false;
  return /senat/.test(o) || /repres/.test(o) || /\bhouse\b/.test(o) || /assembl/.test(o);
}

/**
 * Campaign-finance summary for a NC state legislator, sourced from the NC State
 * Board of Elections (NCSBE — state-level data the FEC does not cover). Name /
 * district / chamber matching happens server-side in nc_legislator_finance().
 */
export function useNcLegislatorFinance(params: Params) {
  const { name, district, office } = params;
  const enabled = !!name && isNcStateLegislator(params);

  return useQuery({
    queryKey: ['nc-legislator-finance', name, district, office],
    enabled,
    staleTime: 1000 * 60 * 60,
    queryFn: async (): Promise<NcLegislatorFinance | null> => {
      // RPC isn't in the generated types yet; cast to keep this self-contained.
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>)('nc_legislator_finance', {
        p_name: name,
        p_district: district ?? null,
        p_office: office ?? null,
      });
      if (error) throw error;
      return (data as NcLegislatorFinance) ?? null;
    },
  });
}
