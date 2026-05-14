import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DonorFilters {
  page: number;
  pageSize: number;
  sortBy: 'amount' | 'name';
  sortOrder: 'asc' | 'desc';
  cycle: string;
  type: string;
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
  types?: string[]; // All types for consolidated donors
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
  cycle: '',
  type: 'all',
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
      // Get all distinct cycles via RPC (avoids 1000-row scan limit hiding older cycles)
      const { data: cyclesData } = await supabase.rpc('get_donor_cycles');

      const cycles = [...new Set((cyclesData || []).map((d: { cycle: string }) => d.cycle).filter(Boolean))] as string[];
      
      // Get distinct states - limit scan for faster load
      const { data: statesData } = await supabase
        .from('donors')
        .select('contributor_state')
        .not('contributor_state', 'is', null)
        .order('contributor_state')
        .limit(5000);
      
      const states = [...new Set(statesData?.map(d => d.contributor_state).filter(Boolean) || [])] as string[];
      
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
    search,
    minAmount,
  } = mergedFilters;

  return useQuery({
    queryKey: ['donors-paginated', mergedFilters],
    queryFn: async () => {
      // Always use consolidated view - aliases are applied automatically
      let query = supabase
        .from('donor_consolidated')
        .select('*', { count: 'exact' });

      if (cycle && cycle !== 'all') {
        query = query.eq('cycle', cycle);
      }

      if (type && type !== 'all') {
        // Filter by types array using contains
        query = query.contains('types', [type]);
      }

      if (search) {
        // Search against search_text which includes display_name AND name_variations
        query = query.ilike('search_text', `%${search}%`);
      }

      if (minAmount !== null) {
        query = query.gte('total_amount', minAmount);
      }

      // Apply sorting (single column to leverage index and avoid statement timeouts)
      if (sortBy === 'amount') {
        query = query.order('total_amount', { ascending: sortOrder === 'asc', nullsFirst: false });
      } else {
        query = query.order('display_name', { ascending: sortOrder === 'asc' });
      }

      // Apply pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      const donors: DonorWithCandidate[] = (data || []).map((d: any) => ({
        id: d.primary_id,
        name: d.display_name,
        amount: d.total_amount,
        type: d.type,
        types: d.types, // All types for this donor
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
      }));

      return {
        donors,
        totalCount: count || 0,
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
        p_type: donorType && donorType !== 'all' ? donorType : null,
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

// Hook to get alias for a specific donor name (now uses donor_types array)
export const useDonorAlias = (donorName: string, donorType: string) => {
  return useQuery({
    queryKey: ['donor-alias-for', donorName, donorType],
    queryFn: async () => {
      if (!donorName) return null;
      
      const { data, error } = await supabase
        .from('donor_aliases')
        .select('*')
        .eq('is_active', true);
      
      if (error) throw error;
      
      // Find matching alias using ILIKE pattern matching and donor_types array
      const matchingAlias = (data || []).find(alias => {
        // Check if the donor type is in the alias's donor_types array
        if (!alias.donor_types?.includes(donorType)) return false;
        const pattern = alias.alias_pattern.replace(/%/g, '.*').replace(/_/g, '.');
        const regex = new RegExp(`^${pattern}$`, 'i');
        return regex.test(donorName);
      });
      
      return matchingAlias || null;
    },
    enabled: !!donorName && !!donorType,
  });
};