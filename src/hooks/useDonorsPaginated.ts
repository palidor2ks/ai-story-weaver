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
  consolidated: boolean;
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
  consolidated: false,
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
    state,
    minAmount,
    maxAmount,
    includeTransfers,
    includeConduitOrgs,
    candidateId,
    party,
    consolidated,
  } = mergedFilters;

  return useQuery({
    queryKey: ['donors-paginated', mergedFilters],
    queryFn: async () => {
      // Use consolidated view when enabled
      if (consolidated) {
        return fetchConsolidatedDonors(mergedFilters);
      }
      
      // Build the query for regular donors
      let query = supabase
        .from('donors')
        .select(`
          id,
          name,
          amount,
          type,
          cycle,
          candidate_id,
          contributor_state,
          contributor_city,
          employer,
          occupation,
          transaction_count,
          is_transfer,
          is_conduit_org,
          candidates!inner(name, party)
        `, { count: 'exact' });

      // Apply filters
      if (cycle && cycle !== 'all') {
        query = query.eq('cycle', cycle);
      }

      if (type && type !== 'all') {
        query = query.eq('type', type as 'Individual' | 'PAC' | 'Organization' | 'Unknown');
      }

      if (state && state !== 'all') {
        query = query.eq('contributor_state', state);
      }

      if (minAmount !== null) {
        query = query.gte('amount', minAmount);
      }

      if (maxAmount !== null) {
        query = query.lte('amount', maxAmount);
      }

      if (!includeTransfers) {
        query = query.or('is_transfer.is.null,is_transfer.eq.false');
      }

      if (!includeConduitOrgs) {
        query = query.or('is_conduit_org.is.null,is_conduit_org.eq.false');
      }

      if (candidateId) {
        query = query.eq('candidate_id', candidateId);
      }

      if (search) {
        query = query.ilike('name', `%${search}%`);
      }

      // Apply sorting
      if (sortBy === 'amount') {
        query = query.order('amount', { ascending: sortOrder === 'asc' });
      } else {
        query = query.order('name', { ascending: sortOrder === 'asc' });
      }

      // Apply pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      // Apply party filter client-side
      let filteredData = data || [];
      if (party && party !== 'all') {
        filteredData = filteredData.filter(d => {
          const cand = d.candidates as { name: string; party: string } | null;
          return cand?.party === party;
        });
      }

      const donors: DonorWithCandidate[] = filteredData.map(d => ({
        id: d.id,
        name: d.name,
        amount: d.amount,
        type: d.type,
        cycle: d.cycle,
        candidate_id: d.candidate_id,
        contributor_state: d.contributor_state,
        contributor_city: d.contributor_city,
        employer: d.employer,
        occupation: d.occupation,
        transaction_count: d.transaction_count,
        is_transfer: d.is_transfer,
        is_conduit_org: d.is_conduit_org,
        candidate: d.candidates as { name: string; party: string } | undefined,
      }));

      return {
        donors,
        totalCount: count || 0,
      };
    },
    placeholderData: (prev) => prev,
  });
};

// Fetch from consolidated view
async function fetchConsolidatedDonors(filters: DonorFilters) {
  const { page, pageSize, sortBy, sortOrder, cycle, type, search, minAmount } = filters;

  let query = supabase
    .from('donor_consolidated')
    .select('*', { count: 'exact' });

  if (cycle && cycle !== 'all') {
    query = query.eq('cycle', cycle);
  }

  if (type && type !== 'all') {
    query = query.eq('type', type);
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
}
