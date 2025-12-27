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
      // Get distinct cycles
      const { data: cyclesData } = await supabase
        .from('donors')
        .select('cycle')
        .order('cycle', { ascending: false });
      
      const cycles = [...new Set(cyclesData?.map(d => d.cycle) || [])];
      
      // Get distinct states
      const { data: statesData } = await supabase
        .from('donors')
        .select('contributor_state')
        .not('contributor_state', 'is', null)
        .order('contributor_state');
      
      const states = [...new Set(statesData?.map(d => d.contributor_state).filter(Boolean) || [])] as string[];
      
      return { cycles, states };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
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
        query = query.eq('type', type as 'Individual' | 'PAC' | 'Organization' | 'Unknown');
      }

      if (search) {
        query = query.ilike('display_name', `%${search}%`);
      }

      if (minAmount !== null) {
        query = query.gte('total_amount', minAmount);
      }

      // Apply sorting
      if (sortBy === 'amount') {
        query = query.order('total_amount', { ascending: sortOrder === 'asc' });
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

// Hook to search donors by name for admin alias assignment
export const useSearchDonors = (searchTerm: string, donorType?: string) => {
  return useQuery({
    queryKey: ['donor-search', searchTerm, donorType],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];
      
      let query = supabase
        .from('donors')
        .select('id, name, type, amount, cycle, candidate_id')
        .ilike('name', `%${searchTerm}%`)
        .order('amount', { ascending: false })
        .limit(50);
      
      if (donorType && donorType !== 'all') {
        query = query.eq('type', donorType as 'Individual' | 'PAC' | 'Organization' | 'Unknown');
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Group by name to show unique donors
      const uniqueDonors = new Map<string, { name: string; type: string; totalAmount: number; count: number }>();
      (data || []).forEach(d => {
        const key = `${d.name}|${d.type}`;
        const existing = uniqueDonors.get(key);
        if (existing) {
          existing.totalAmount += d.amount;
          existing.count += 1;
        } else {
          uniqueDonors.set(key, { name: d.name, type: d.type, totalAmount: d.amount, count: 1 });
        }
      });
      
      return Array.from(uniqueDonors.values()).sort((a, b) => b.totalAmount - a.totalAmount);
    },
    enabled: searchTerm.length >= 2,
  });
};

// Hook to get alias for a specific donor name
export const useDonorAlias = (donorName: string, donorType: string) => {
  return useQuery({
    queryKey: ['donor-alias-for', donorName, donorType],
    queryFn: async () => {
      if (!donorName) return null;
      
      const { data, error } = await supabase
        .from('donor_aliases')
        .select('*')
        .eq('donor_type', donorType)
        .eq('is_active', true);
      
      if (error) throw error;
      
      // Find matching alias using ILIKE pattern matching (client-side simulation)
      const matchingAlias = (data || []).find(alias => {
        const pattern = alias.alias_pattern.replace(/%/g, '.*').replace(/_/g, '.');
        const regex = new RegExp(`^${pattern}$`, 'i');
        return regex.test(donorName);
      });
      
      return matchingAlias || null;
    },
    enabled: !!donorName && !!donorType,
  });
};