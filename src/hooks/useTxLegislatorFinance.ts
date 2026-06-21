import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TxMatchedEntity {
  filer_ident: string;
  filer_name: string;
  office_cd: string | null;       // 'STATEREP' | 'STATESEN'
  office_district: string | null;
  total: number;
  n: number;
}

export interface TxTopContributor {
  contributor: string;
  contributor_type: string | null; // 'INDIVIDUAL' | 'ENTITY'
  total: number;
  n: number;
}

export interface TxLegislatorFinance {
  matched_entities: TxMatchedEntity[];
  total_raised: number;
  contribution_count: number;
  election_years: number[];
  top_contributors: TxTopContributor[];
}

interface Params {
  name?: string | null;
  district?: string | null;
  office?: string | null;
  state?: string | null;
  level?: string | null;
}

/**
 * True when this official is a TX state legislator (State House / State Senate).
 * Excludes federal offices that also contain "senat" (e.g. "U.S. Senator") so the
 * federal/FEC pipeline owns those — the TEC dataset is state-legislative only.
 */
export function isTxStateLegislator({ state, office, level }: Params): boolean {
  if (state !== 'TX' || !office || level === 'federal') return false;
  const o = office.toLowerCase();
  if (/\bu\.?\s*s\.?\b|united states|congress/.test(o)) return false;
  return /senat/.test(o) || /repres/.test(o) || /house/.test(o);
}

/**
 * Campaign-finance summary for a TX state legislator, sourced from the Texas Ethics
 * Commission bulk dataset (state-level data the FEC does not cover). Name/chamber
 * matching to TEC filer accounts happens server-side in tx_legislator_finance(), so
 * the client just passes the official's identifying fields.
 */
export function useTxLegislatorFinance(params: Params) {
  const { name, district, office } = params;
  const enabled = !!name && isTxStateLegislator(params);

  return useQuery({
    queryKey: ['tx-legislator-finance', name, district, office],
    enabled,
    staleTime: 1000 * 60 * 60,
    queryFn: async (): Promise<TxLegislatorFinance | null> => {
      // RPC isn't in the generated types yet; cast to keep this self-contained.
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>)('tx_legislator_finance', {
        p_name: name,
        p_district: district ?? null,
        p_office: office ?? null,
      });
      if (error) throw error;
      return (data as TxLegislatorFinance) ?? null;
    },
  });
}
