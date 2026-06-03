import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface NyMatchedEntity {
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

export interface NyTopContributor {
  contributor: string;
  contributor_type: string | null;
  is_individual: boolean;
  total: number;
  n: number;
  emp_name: string | null;
  occupation: string | null;
}

export interface NyLegislatorFinance {
  matched_entities: NyMatchedEntity[];
  total_raised: number;
  contribution_count: number;
  election_years: number[];
  top_contributors: NyTopContributor[];
}

interface Params {
  name?: string | null;
  district?: string | null;
  office?: string | null;
  state?: string | null;
  level?: string | null;
}

/**
 * True when this official is a NY state legislator (State Senate / State
 * Assembly). Excludes federal offices (U.S. House/Senate from NY) so the FEC
 * pipeline owns those — the NYSBOE dataset is state-only.
 */
export function isNyStateLegislator({ state, office, level }: Params): boolean {
  if (state !== 'NY' || !office || level === 'federal') return false;
  const o = office.toLowerCase();
  // Federal offices ("U.S. Senator"/"U.S. Representative" contain "senat"/"repres").
  if (/\bu\.?\s*s\.?\b|united states|congress/.test(o)) return false;
  return /senat/.test(o) || /assembl/.test(o);
}

/**
 * Campaign-finance summary for a NY state legislator, sourced from the NY State
 * Board of Elections via data.ny.gov (state-level data the FEC does not cover).
 * Name/district/chamber matching to NY filers happens server-side in the
 * ny_legislator_finance() RPC, so the client just passes the identifying fields.
 */
export function useNyLegislatorFinance(params: Params) {
  const { name, district, office } = params;
  const enabled = !!name && isNyStateLegislator(params);

  return useQuery({
    queryKey: ['ny-legislator-finance', name, district, office],
    enabled,
    staleTime: 1000 * 60 * 60,
    queryFn: async (): Promise<NyLegislatorFinance | null> => {
      // RPC isn't in the generated types yet; cast to keep this self-contained.
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>)('ny_legislator_finance', {
        p_name: name,
        p_district: district ?? null,
        p_office: office ?? null,
      });
      if (error) throw error;
      return (data as NyLegislatorFinance) ?? null;
    },
  });
}
