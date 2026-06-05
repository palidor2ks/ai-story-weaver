import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getPrimaryDonorEntityType, toDonorTypeFilterValue } from '@/lib/donorType';
import type { DonorAlias } from '@/hooks/useDonorAliases';

export interface DonorFilters {
  page: number;
  pageSize: number;
  sortBy: 'amount' | 'name';
  sortOrder: 'asc' | 'desc';
  cycle: string;
  type: string;
  /** Jurisdiction: 'all' | 'federal' | 'state' (NJ). Maps to the RPC's p_source. */
  jurisdiction: string;
  search: string;
  state: string;
  minAmount: number | null;
  maxAmount: number | null;
  includeTransfers: boolean;
  includeConduitOrgs: boolean;
  candidateId: string | null;
  party: string;
}

export interface DonorWithCandidate {
  id: string;
  name: string;
  amount: number;
  type: string;
  types?: string[]; // One display entity type for consolidated donors
  cycle: string;
  candidate_id: string;
  contributor_state: string | null;
  contributor_city: string | null;
  employer: string | null;
  occupation: string | null;
  transaction_count: number | null;
  is_transfer: boolean | null;
  is_conduit_org: boolean | null;
  candidate?: {
    name: string;
    party: string;
  };
  // Consolidated view fields
  is_consolidated?: boolean;
  name_variations?: string[];
  recipient_count?: number;
  // Source breakdown (federal FEC vs state ELEC/DOE, per-state)
  federal_amount?: number;
  state_amount?: number;
  sources?: string[];
  state_codes?: string[];
  state_amounts?: Record<string, number>;
}

export interface UseDonorsPaginatedResult {
  donors: DonorWithCandidate[];
  totalCount: number;
  isLoading: boolean;
  error: Error | null;
  availableCycles: string[];
  availableStates: string[];
}

const DEFAULT_FILTERS: DonorFilters = {
  page: 1,
  pageSize: 50,
  sortBy: 'amount',
  sortOrder: 'desc',
  cycle: 'all',
  type: 'all',
  jurisdiction: 'all',
  search: '',
  state: 'all',
  minAmount: null,
  maxAmount: null,
  includeTransfers: true,
  includeConduitOrgs: true,
  candidateId: null,
  party: 'all',
};

// Fetch available filter options
export const useAvailableDonorFilters = () => {
  return useQuery({
    queryKey: ['donor-filter-options'],
    queryFn: async () => {
      // Get all distinct cycles via RPC (avoids 1000-row scan limit hiding older cycles).
      // The cycle dropdown is populated entirely from this call, so a failure must be
      // surfaced (thrown) rather than swallowed. If we silently fell back to an empty
      // list, React Query would cache that empty result as a "success" for the whole
      // staleTime window and never retry -- leaving the cycle filter with nothing to
      // select (the "can't filter by cycle" symptom). Throwing lets React Query retry
      // transient failures (e.g. PostgREST schema-cache reloads after migrations).
      const { data: cyclesData, error: cyclesError } = await supabase.rpc('get_donor_cycles');
      if (cyclesError) throw cyclesError;

      const cycles = [...new Set((cyclesData || []).map((d: { cycle: string }) => d.cycle).filter(Boolean))] as string[];

      // Get distinct states - limit scan for faster load. States are a secondary filter,
      // so a states failure should not wipe out the (already loaded) cycle options.
      const { data: statesData, error: statesError } = await supabase
        .from('donors')
        .select('contributor_state')
        .not('contributor_state', 'is', null)
        .order('contributor_state')
        .limit(5000);

      if (statesError) {
        console.error('Failed to load donor state filter options', statesError);
      }

      const states = [...new Set((statesData || []).map(d => d.contributor_state).filter(Boolean))] as string[];

      return { cycles, states };
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - cache longer
  });
};

// Always use consolidated view - aliases are always applied
export const useDonorsPaginated = (filters: Partial<DonorFilters> = {}) => {
  const mergedFilters = { ...DEFAULT_FILTERS, ...filters };
  
  const {
    page,
    pageSize,
    sortBy,
    sortOrder,
    cycle,
    type,
    jurisdiction,
    search,
    minAmount,
  } = mergedFilters;

  return useQuery({
    queryKey: ['donors-paginated', mergedFilters],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_donors_paginated', {
        p_page: page,
        p_page_size: pageSize,
        p_sort_by: sortBy,
        p_sort_order: sortOrder,
        p_cycle: cycle && cycle !== 'all' ? cycle : null,
        p_type: toDonorTypeFilterValue(type),
        p_search: search || null,
        p_min_amount: minAmount,
        p_source: jurisdiction && jurisdiction !== 'all' ? jurisdiction : null,
      });

      if (error) throw error;

      const donors: DonorWithCandidate[] = (data || []).map((d: any) => ({
        id: d.primary_id,
        name: d.display_name,
        amount: d.total_amount,
        type: getPrimaryDonorEntityType(d.type, d.types),
        types: [getPrimaryDonorEntityType(d.type, d.types)], // One display entity type per donor
        cycle: d.cycle,
        candidate_id: '',
        contributor_state: null,
        contributor_city: null,
        employer: null,
        occupation: null,
        transaction_count: d.total_transactions,
        is_transfer: null,
        is_conduit_org: null,
        is_consolidated: d.is_consolidated,
        name_variations: d.name_variations,
        recipient_count: d.recipient_count,
        federal_amount: d.federal_amount != null ? Number(d.federal_amount) : undefined,
        state_amount: d.state_amount != null ? Number(d.state_amount) : undefined,
        sources: d.sources ?? undefined,
        state_codes: d.state_codes ?? undefined,
        state_amounts: d.state_amounts ?? undefined,
      }));

      return {
        donors,
        totalCount: Number(data?.[0]?.total_count || 0),
      };
    },
    placeholderData: (prev) => prev,
  });
};

// Hook to search donors by canonical name (uses consolidated view)
export const useSearchDonors = (searchTerm: string, donorType?: string) => {
  return useQuery({
    queryKey: ['donor-search', searchTerm, donorType],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 3) return [];

      const { data, error } = await supabase.rpc('search_donors_by_name', {
        p_search: searchTerm,
        p_type: toDonorTypeFilterValue(donorType),
        p_limit: 50,
      });
      if (error) throw error;

      return (data || []).map((d: any) => ({
        name: d.display_name,
        type: d.type,
        totalAmount: Number(d.total_amount) || 0,
        count: d.name_variations?.length || 1,
        isConsolidated: d.is_consolidated,
        nameVariations: d.name_variations,
      }));
    },
    enabled: searchTerm.length >= 3,
  });
};

// Hook to search RAW donor names (one row per name+type variation, not collapsed by display_name)
export const useSearchRawDonors = (searchTerm: string, donorType?: string) => {
  return useQuery({
    queryKey: ['donor-search-raw', searchTerm, donorType],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 3) return [];

      const { data, error } = await supabase.rpc('search_raw_donors_by_name', {
        p_search: searchTerm,
        p_type: donorType && donorType !== 'all' ? donorType : null,
        p_limit: 50,
      });
      if (error) throw error;

      return (data || []).map((d: any) => ({
        name: d.donor_name as string,
        type: d.type as string,
        totalAmount: Number(d.total_amount) || 0,
        transactionCount: Number(d.transaction_count) || 0,
      }));
    },
    enabled: searchTerm.length >= 3,
  });
};


export interface RawDonorAdminSearchResult {
  name: string;
  type: string;
  totalAmount: number;
  transactionCount: number;
  currentAlias: DonorAlias | null;
  directCause: { primary_cause_id: string; assigned_by: string } | null;
  treasurerNames: string;
}

const mapAdminAlias = (d: any): DonorAlias | null => {
  if (!d.alias_id) return null;
  return {
    id: d.alias_id,
    canonical_name: d.alias_canonical_name,
    fec_committee_id: d.alias_fec_committee_id ?? null,
    fec_committee_ids: d.alias_fec_committee_ids ?? [],
    notes: d.alias_notes ?? null,
    is_active: d.alias_is_active ?? true,
    created_at: d.alias_created_at ?? '',
    updated_at: d.alias_updated_at ?? '',
    primary_cause_id: d.alias_primary_cause_id ?? null,
    cause_assigned_by: d.alias_cause_assigned_by ?? null,
    cause_ai_confidence: d.alias_cause_ai_confidence ?? null,
    cause_ai_reasoning: d.alias_cause_ai_reasoning ?? null,
    cause_assigned_at: d.alias_cause_assigned_at ?? null,
  };
};

// Admin RAW donor search with row enrichment returned by one RPC.
export const useSearchRawDonorsAdmin = (searchTerm: string, donorType?: string) => {
  return useQuery({
    queryKey: ['donor-search-raw-admin', searchTerm, donorType],
    queryFn: async (): Promise<RawDonorAdminSearchResult[]> => {
      if (!searchTerm || searchTerm.length < 3) return [];

      const { data, error } = await (supabase as any).rpc('search_raw_donors_admin', {
        p_search: searchTerm,
        p_type: donorType && donorType !== 'all' ? donorType : null,
        p_limit: 50,
      });
      if (error) throw error;

      return (data || []).map((d: any) => ({
        name: d.donor_name as string,
        type: d.type as string,
        totalAmount: Number(d.total_amount) || 0,
        transactionCount: Number(d.transaction_count) || 0,
        currentAlias: mapAdminAlias(d),
        directCause: d.direct_primary_cause_id
          ? { primary_cause_id: d.direct_primary_cause_id, assigned_by: d.direct_assigned_by || 'admin' }
          : null,
        treasurerNames: d.treasurer_names || '',
      }));
    },
    enabled: searchTerm.length >= 3,
  });
};

// Hook to get alias for a specific donor name via donor_alias_members
export const useDonorAlias = (donorName: string, donorType: string) => {
  return useQuery({
    queryKey: ['donor-alias-for', donorName, donorType],
    queryFn: async () => {
      if (!donorName) return null;

      const { data, error } = await supabase
        .from('donor_alias_members')
        .select('alias_id, donor_aliases!inner(*)')
        .eq('donor_name', donorName)
        .eq('donor_type', donorType)
        .eq('donor_aliases.is_active', true)
        .maybeSingle();

      if (error) throw error;
      return (data as any)?.donor_aliases || null;
    },
    enabled: !!donorName && !!donorType,
  });
};