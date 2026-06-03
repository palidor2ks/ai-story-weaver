import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface NjMatchedEntity {
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

export interface NjTopContributor {
  contributor: string;
  contributor_type: string | null;
  is_individual: boolean;
  total: number;
  n: number;
  emp_name: string | null;
  occupation: string | null;
}

export interface NjLegislatorFinance {
  matched_entities: NjMatchedEntity[];
  total_raised: number;
  contribution_count: number;
  election_years: number[];
  top_contributors: NjTopContributor[];
}

interface Params {
  name?: string | null;
  district?: string | null;
  office?: string | null;
  state?: string | null;
  level?: string | null;
}

/** True when this official is a NJ state legislator (State Senate / Assembly). */
export function isNjStateLegislator({ state, office, level }: Params): boolean {
  return state === 'NJ' && !!office && /assembl|senat/i.test(office) && level !== 'federal';
}

/**
 * Campaign-finance summary for a NJ state legislator, sourced from NJ ELEC
 * (state-level data the FEC does not cover). Name/district/chamber matching to
 * ELEC entities happens server-side in the nj_legislator_finance() RPC, so the
 * client just passes the official's identifying fields.
 */
export function useNjLegislatorFinance(params: Params) {
  const { name, district, office } = params;
  const enabled = !!name && isNjStateLegislator(params);

  return useQuery({
    queryKey: ['nj-legislator-finance', name, district, office],
    enabled,
    staleTime: 1000 * 60 * 60,
    queryFn: async (): Promise<NjLegislatorFinance | null> => {
      // RPC isn't in the generated types yet; cast to keep this self-contained.
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>)('nj_legislator_finance', {
        p_name: name,
        p_district: district ?? null,
        p_office: office ?? null,
      });
      if (error) throw error;
      return (data as NjLegislatorFinance) ?? null;
    },
  });
}
