import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CommitteeSummary {
  id: string;
  name: string | null;
  aliasName?: string | null;
  fecCommitteeId: string;
  designation: string | null;
  designationFull: string | null;
  role: string | null;
  cycles: string[] | null;
  lastSyncDate: string | null;
  lastContributionDate: string | null;
  localItemizedTotal: number | null;
  fecItemizedTotal: number | null;
  candidateId: string | null;
  candidate?: {
    id: string;
    name: string;
    party: string;
    office: string;
    state: string;
  } | null;
  donorCount: number | null;
  contributionCount: number | null;
  totalRaised: number;
  hasRollupData: boolean;
}

export interface CommitteeDonor {
  id: string;
  name: string;
  totalAmount: number;
  contributionCount: number;
  latestDate: string | null;
  city?: string | null;
  state?: string | null;
  occupation?: string | null;
  employer?: string | null;
  candidateNames?: string[];
}

interface CommitteeRollupRow {
  committee_id: string;
  candidate_id: string;
  donor_count: number | null;
  contribution_count: number | null;
  local_itemized: number | null;
  fec_itemized: number | null;
  fec_total_receipts: number | null;
  cycle: string;
}

interface CommitteeRow {
  id: string;
  name: string | null;
  
  fec_committee_id: string;
  designation: string | null;
  designation_full: string | null;
  role: string | null;
  cycles: string[] | null;
  last_sync_date: string | null;
  last_contribution_date: string | null;
  local_itemized_total: number | null;
  fec_itemized_total: number | null;
  candidate_id: string | null;
  candidates?: {
    id: string;
    name: string;
    party: string;
    office: string;
    state: string;
  } | null;
}

const buildCommitteeSummaries = (
  committees: CommitteeRow[] = [],
  rollups: CommitteeRollupRow[] = [],
  cycle?: string,
) => {
  const rollupByCommittee = new Map<string, CommitteeRollupRow[]>();

  rollups.forEach((row) => {
    const list = rollupByCommittee.get(row.committee_id) || [];
    list.push(row);
    rollupByCommittee.set(row.committee_id, list);
  });

  return committees.map((committee) => {
    const committeeRollups = rollupByCommittee.get(committee.fec_committee_id) || [];
    const isAllCycles = !cycle || cycle === 'all';

    // When a specific cycle is selected, pick that cycle's rollup row.
    // When "all cycles", aggregate across every rollup row for this committee
    // (avoids the bug where a stale zero-row for one cycle masked the real one).
    const matchingRollup = isAllCycles
      ? null
      : (committeeRollups.find((row) => row.cycle === cycle) ?? null);

    const aggregatedRollup = isAllCycles && committeeRollups.length > 0
      ? committeeRollups.reduce(
          (acc, row) => {
            const raised = row.local_itemized ?? row.fec_total_receipts ?? row.fec_itemized ?? 0;
            return {
              donor_count: acc.donor_count + (row.donor_count ?? 0),
              contribution_count: acc.contribution_count + (row.contribution_count ?? 0),
              total_raised: acc.total_raised + raised,
            };
          },
          { donor_count: 0, contribution_count: 0, total_raised: 0 },
        )
      : null;

    const totalRaised =
      matchingRollup?.local_itemized ??
      matchingRollup?.fec_total_receipts ??
      matchingRollup?.fec_itemized ??
      aggregatedRollup?.total_raised ??
      committee.local_itemized_total ??
      committee.fec_itemized_total ??
      0;

    const hasRollupData = committeeRollups.length > 0;
    const donorCount = hasRollupData
      ? (matchingRollup?.donor_count ?? aggregatedRollup?.donor_count ?? 0)
      : null;
    const contributionCount = hasRollupData
      ? (matchingRollup?.contribution_count ?? aggregatedRollup?.contribution_count ?? 0)
      : null;

    // Name fallback chain: committee.name → linked candidate name → "Unknown Committee"
    const candidateName = committee.candidates?.name;
    const resolvedName =
      committee.name ??
      (candidateName ? `${candidateName} Committee` : null);

    return {
      id: committee.id,
      name: resolvedName,
      aliasName: null,
      fecCommitteeId: committee.fec_committee_id,
      designation: committee.designation,
      designationFull: committee.designation_full,
      role: committee.role,
      cycles: committee.cycles,
      lastSyncDate: committee.last_sync_date,
      lastContributionDate: committee.last_contribution_date,
      localItemizedTotal: committee.local_itemized_total,
      fecItemizedTotal: committee.fec_itemized_total,
      candidateId: committee.candidate_id,
      candidate: committee.candidates,
      donorCount,
      contributionCount,
      totalRaised,
      hasRollupData,
    } as CommitteeSummary;
  });
};

async function fetchCommittees(cycle: string = 'all', committeeId?: string) {
  let query = supabase
    .from('candidate_committees')
    .select(`
      id,
      name,
      fec_committee_id,
      designation,
      designation_full,
      role,
      cycles,
      last_sync_date,
      last_contribution_date,
      local_itemized_total,
      fec_itemized_total,
      candidate_id,
      candidates:candidate_id (
        id,
        name,
        party,
        office,
        state
      )
    `);

  if (committeeId) {
    query = query.eq('fec_committee_id', committeeId);
  }

  const { data: committees, error: committeeError } = await query
    .order('local_itemized_total', { ascending: false, nullsFirst: false })
    .order('fec_itemized_total', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true })
    .returns<CommitteeRow[]>();
  if (committeeError) throw committeeError;

  const committeeIds = (committees || []).map((c) => c.fec_committee_id).filter(Boolean);

  let rollups: CommitteeRollupRow[] = [];
  if (committeeIds.length > 0) {
    let rollupQuery = supabase
      .from('committee_finance_rollups')
      .select('committee_id, candidate_id, donor_count, contribution_count, local_itemized, fec_itemized, fec_total_receipts, cycle')
      .in('committee_id', committeeIds);

    if (cycle && cycle !== 'all') {
      rollupQuery = rollupQuery.eq('cycle', cycle);
    }

    const { data: rollupData, error: rollupError } = await rollupQuery.returns<CommitteeRollupRow[]>();

    if (rollupError) throw rollupError;
    rollups = rollupData || [];
  }

  return buildCommitteeSummaries(committees, rollups, cycle);
}

export const useCommittees = (cycle = 'all') => {
  return useQuery({
    queryKey: ['committees', cycle],
    queryFn: () => fetchCommittees(cycle),
  });
};

export interface CommitteeFilters {
  search?: string;
  cycle?: string;
  designation?: string;
  candidateId?: string;
  pageSize?: number;
}

interface CommitteeFilterOptions {
  cycles: string[];
  designations: string[];
  candidates: { id: string; name: string; party: string }[];
}

interface CommitteePageResult {
  committees: CommitteeSummary[];
  totalCount: number;
  hasMore: boolean;
}

const PAGE_SIZE_DEFAULT = 50;

const fetchCommitteePage = async (
  page: number,
  filters: CommitteeFilters = {},
): Promise<CommitteePageResult> => {
  const {
    search = '',
    cycle = 'all',
    designation,
    candidateId,
    pageSize = PAGE_SIZE_DEFAULT,
  } = filters;

  const offset = page * pageSize;
  const limit = pageSize - 1;

  let committeeQuery = supabase
    .from('candidate_committees')
    .select(`
      id,
      name,
      fec_committee_id,
      designation,
      designation_full,
      role,
      cycles,
      last_sync_date,
      last_contribution_date,
      local_itemized_total,
      fec_itemized_total,
      candidate_id,
      candidates:candidate_id (
        id,
        name,
        party,
        office,
        state
      )
    `, { count: 'exact' })
    .order('local_itemized_total', { ascending: false, nullsFirst: false })
    .order('fec_itemized_total', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true })
    .range(offset, offset + limit);

  if (cycle && cycle !== 'all') {
    committeeQuery = committeeQuery.contains('cycles', [cycle]);
  }

  if (designation && designation !== 'all') {
    committeeQuery = committeeQuery.eq('designation', designation);
  }

  if (candidateId && candidateId !== 'all') {
    committeeQuery = committeeQuery.eq('candidate_id', candidateId);
  }

  if (search) {
    committeeQuery = committeeQuery.or(`name.ilike.%${search}%,fec_committee_id.ilike.%${search}%,candidates.name.ilike.%${search}%`);
  }

  const { data: committees, error: committeeError, count } = await committeeQuery.returns<CommitteeRow[]>();
  if (committeeError) throw committeeError;

  const committeeIds = (committees || []).map((c) => c.fec_committee_id).filter(Boolean);

  let rollups: CommitteeRollupRow[] = [];
  if (committeeIds.length > 0) {
    let rollupQuery = supabase
      .from('committee_finance_rollups')
      .select('committee_id, candidate_id, donor_count, contribution_count, local_itemized, fec_itemized, fec_total_receipts, cycle')
      .in('committee_id', committeeIds);

    if (cycle && cycle !== 'all') {
      rollupQuery = rollupQuery.eq('cycle', cycle);
    }

    const { data: rollupData, error: rollupError } = await rollupQuery.returns<CommitteeRollupRow[]>();
    if (rollupError) throw rollupError;
    rollups = rollupData || [];
  }

  const summaries = buildCommitteeSummaries(committees, rollups, cycle);
  const totalCount = count ?? summaries.length;
  const hasMore = offset + summaries.length < totalCount;

  return { committees: summaries, totalCount, hasMore };
};

export const useCommitteesPaginated = (filters: CommitteeFilters) => {
  const pageSize = filters.pageSize ?? PAGE_SIZE_DEFAULT;

  return useInfiniteQuery({
    queryKey: ['committees', 'paginated', { ...filters, pageSize }],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => fetchCommitteePage(pageParam, { ...filters, pageSize }),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.committees.length, 0);
      if (lastPage.hasMore && lastPage.totalCount > loaded) {
        return pages.length;
      }
      if (lastPage.hasMore && lastPage.committees.length === pageSize) {
        return pages.length;
      }
      return undefined;
    },
  });
};

const fetchCommitteeFilterOptions = async (): Promise<CommitteeFilterOptions> => {
  // Limit scans for faster load
  const [cyclesResult, designationResult, candidatesResult] = await Promise.all([
    supabase.rpc('get_committee_cycles'),
    supabase.from('candidate_committees').select('designation').limit(500),
    supabase.from('candidates').select('id, name, party').not('fec_committee_id', 'is', null).order('name').limit(200),
  ]);

  if (cyclesResult.error) throw cyclesResult.error;
  if (designationResult.error) throw designationResult.error;
  if (candidatesResult.error) throw candidatesResult.error;

  const cycleSet = new Set<string>(
    ((cyclesResult.data as string[] | null) || []).filter((cycle): cycle is string => !!cycle),
  );

  const designationSet = new Set<string>(
    (designationResult.data || [])
      .map((row) => row.designation)
      .filter((designation): designation is string => !!designation),
  );

  const candidates = (candidatesResult.data || []).map((row) => ({
    id: row.id,
    name: row.name,
    party: row.party,
  }));

  return {
    cycles: Array.from(cycleSet).sort((a, b) => Number(b) - Number(a)),
    designations: Array.from(designationSet).sort(),
    candidates,
  };
};

export const useCommitteeFilterOptions = () => {
  return useQuery({
    queryKey: ['committee-filter-options'],
    queryFn: fetchCommitteeFilterOptions,
    staleTime: 10 * 60 * 1000, // 10 minutes cache
  });
};

export const useCommittee = (committeeId: string | undefined, cycle = 'all') => {
  return useQuery({
    queryKey: ['committee', committeeId, cycle],
    queryFn: async () => {
      if (!committeeId) return null;
      const committees = await fetchCommittees(cycle, committeeId);
      if (committees[0]) return committees[0];

      // Fallback: committee not in candidate_committees — synthesize from contributions + rollups
      const { data: contribRow } = await supabase
        .from('contributions')
        .select('recipient_committee_id, recipient_committee_name, cycle, receipt_date')
        .eq('recipient_committee_id', committeeId)
        .order('receipt_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: rollupRows } = await supabase
        .from('committee_finance_rollups')
        .select('committee_id, candidate_id, donor_count, contribution_count, local_itemized, fec_itemized, fec_total_receipts, cycle')
        .eq('committee_id', committeeId);

      if (!contribRow && (!rollupRows || rollupRows.length === 0)) {
        // Final fallback: IE-only committees (appear only in independent_expenditures)
        const { data: ieRows } = await supabase
          .from('independent_expenditures')
          .select('spending_committee_name, cycle, expenditure_date')
          .eq('spending_committee_fec_id', committeeId)
          .order('expenditure_date', { ascending: false })
          .limit(1000);

        if (!ieRows || ieRows.length === 0) {
          return null;
        }

        const rows = ieRows as Array<{ spending_committee_name: string | null; cycle: string | null; expenditure_date: string | null }>;
        const ieName = rows.find((r) => r.spending_committee_name)?.spending_committee_name ?? committeeId;
        const ieCycles = Array.from(
          new Set(rows.map((r) => r.cycle).filter(Boolean) as string[]),
        ).sort((a, b) => Number(b) - Number(a));
        const lastDate = rows.find((r) => r.expenditure_date)?.expenditure_date ?? null;

        const ieSummary: CommitteeSummary = {
          id: committeeId,
          name: ieName,
          aliasName: null,
          fecCommitteeId: committeeId,
          designation: null,
          designationFull: null,
          role: null,
          cycles: ieCycles,
          lastSyncDate: null,
          lastContributionDate: lastDate,
          localItemizedTotal: null,
          fecItemizedTotal: null,
          candidateId: null,
          candidate: null,
          donorCount: 0,
          contributionCount: 0,
          totalRaised: 0,
        };
        return ieSummary;
      }

      const rollups = (rollupRows || []) as CommitteeRollupRow[];
      const filtered = cycle && cycle !== 'all' ? rollups.filter(r => r.cycle === cycle) : rollups;
      const totals = filtered.reduce(
        (acc, r) => ({
          donor_count: acc.donor_count + (r.donor_count ?? 0),
          contribution_count: acc.contribution_count + (r.contribution_count ?? 0),
          total_raised: acc.total_raised + (r.local_itemized ?? r.fec_total_receipts ?? r.fec_itemized ?? 0),
        }),
        { donor_count: 0, contribution_count: 0, total_raised: 0 },
      );
      let cycles = Array.from(new Set(rollups.map(r => r.cycle).filter(Boolean))) as string[];

      // If rollups are missing/empty but contributions exist, derive totals from contributions table
      if (contribRow && totals.total_raised === 0 && totals.contribution_count === 0) {
        let contribQuery = supabase
          .from('contributions')
          .select('amount, contributor_name, cycle')
          .eq('recipient_committee_id', committeeId)
          .range(0, 9999);
        if (cycle && cycle !== 'all') {
          contribQuery = contribQuery.eq('cycle', cycle);
        }
        const { data: contribRows } = await contribQuery;
        const rows = (contribRows ?? []) as unknown as Array<{ amount: number | null; contributor_name: string | null; cycle: string | null }>;
        if (rows.length > 0) {
          const donorKeys = new Set<string>();
          let raised = 0;
          const cycleSet = new Set<string>(cycles);
          for (const r of rows) {
            raised += Number(r.amount ?? 0);
            const key = r.contributor_name?.toLowerCase().trim() || '';
            if (key) donorKeys.add(key);
            if (r.cycle) cycleSet.add(r.cycle);
          }
          totals.total_raised = raised;
          totals.contribution_count = rows.length;
          totals.donor_count = donorKeys.size;
          cycles = Array.from(cycleSet).sort((a, b) => Number(b) - Number(a));
        }
      }

      const summary: CommitteeSummary = {
        id: committeeId,
        name: contribRow?.recipient_committee_name ?? committeeId,
        aliasName: null,
        fecCommitteeId: committeeId,
        designation: null,
        designationFull: null,
        role: null,
        cycles,
        lastSyncDate: null,
        lastContributionDate: contribRow?.receipt_date ?? null,
        localItemizedTotal: null,
        fecItemizedTotal: null,
        candidateId: null,
        candidate: null,
        donorCount: totals.donor_count,
        contributionCount: totals.contribution_count,
        totalRaised: totals.total_raised,
      };
      return summary;
    },
    enabled: !!committeeId,
  });
};


export const useCommitteeDonors = (committeeId: string | undefined, cycle = 'all') => {
  return useQuery({
    queryKey: ['committee-donors', committeeId, cycle],
    queryFn: async () => {
      if (!committeeId) return [];

      interface ContributionRow {
        id: string;
        contributor_name: string;
        contributor_type: string;
        amount: number;
        receipt_date: string | null;
        contributor_city: string | null;
        contributor_state: string | null;
        employer: string | null;
        occupation: string | null;
        candidate_id: string | null;
      }

      let contribQuery = supabase
        .from('contributions')
        .select(`
          id,
          contributor_name,
          contributor_type,
          amount,
          receipt_date,
          contributor_city,
          contributor_state,
          employer,
          occupation,
          candidate_id
        `)
        .eq('recipient_committee_id', committeeId);

      if (cycle && cycle !== 'all') {
        contribQuery = contribQuery.eq('cycle', cycle);
      }

      const { data, error } = await contribQuery
        .order('amount', { ascending: false })
        .limit(500)
        .returns<ContributionRow[]>();

      if (error) throw error;

      const rows = data || [];
      const candidateIds = Array.from(
        new Set(rows.map((r) => r.candidate_id).filter((id): id is string => !!id)),
      );

      const candidateMap = new Map<string, { name: string }>();
      if (candidateIds.length > 0) {
        const { data: candData } = await supabase
          .from('candidates')
          .select('id, name')
          .in('id', candidateIds);
        (candData || []).forEach((c: { id: string; name: string }) => {
          candidateMap.set(c.id, { name: c.name });
        });
      }

      // Apply donor alias consolidation (same canonical_name used by /donors)
      const rawNames = Array.from(new Set(rows.map((r) => r.contributor_name).filter(Boolean)));
      const nameToAlias = new Map<string, { aliasId: string; canonicalName: string }>();
      if (rawNames.length > 0) {
        const { data: aliasRows } = await supabase
          .from('donor_alias_members')
          .select('donor_name, alias_id, donor_aliases!inner(id, canonical_name, is_active)')
          .in('donor_name', rawNames);
        for (const m of (aliasRows || []) as Array<{
          donor_name: string;
          alias_id: string;
          donor_aliases: { id: string; canonical_name: string; is_active: boolean } | null;
        }>) {
          const a = m.donor_aliases;
          if (a && a.is_active) {
            nameToAlias.set(m.donor_name, { aliasId: a.id, canonicalName: a.canonical_name });
          }
        }
      }

      const donorMap = new Map<string, CommitteeDonor & { _topAmount: number }>();

      rows.forEach((row) => {
        const alias = nameToAlias.get(row.contributor_name);
        const key = alias
          ? `alias:${alias.aliasId}`
          : `${row.contributor_name}-${row.contributor_state || ''}-${row.contributor_city || ''}`;
        const displayName = alias ? alias.canonicalName : row.contributor_name;
        const existing = donorMap.get(key);
        const candidateNames = new Set(existing?.candidateNames || []);
        const candName = row.candidate_id ? candidateMap.get(row.candidate_id)?.name : null;
        if (candName) candidateNames.add(candName);

        const existingDate = existing?.latestDate ? new Date(existing.latestDate) : null;
        const currentDate = row.receipt_date ? new Date(row.receipt_date) : null;
        const latestDate =
          existingDate && currentDate
            ? (existingDate > currentDate ? existing.latestDate : row.receipt_date)
            : currentDate
              ? row.receipt_date
              : existing?.latestDate || null;

        // Prefer location/employer/occupation from the highest-amount contribution
        const rowAmount = row.amount || 0;
        const useThisRowForMeta = !existing || rowAmount > existing._topAmount;

        donorMap.set(key, {
          id: existing?.id || row.id,
          name: displayName,
          totalAmount: (existing?.totalAmount || 0) + rowAmount,
          contributionCount: (existing?.contributionCount || 0) + 1,
          latestDate,
          city: useThisRowForMeta ? (row.contributor_city ?? existing?.city ?? null) : (existing?.city ?? null),
          state: useThisRowForMeta ? (row.contributor_state ?? existing?.state ?? null) : (existing?.state ?? null),
          occupation: useThisRowForMeta ? (row.occupation ?? existing?.occupation ?? null) : (existing?.occupation ?? null),
          employer: useThisRowForMeta ? (row.employer ?? existing?.employer ?? null) : (existing?.employer ?? null),
          candidateNames: Array.from(candidateNames),
          _topAmount: Math.max(existing?._topAmount ?? 0, rowAmount),
        });
      });

      return Array.from(donorMap.values())
        .map(({ _topAmount, ...d }) => d)
        .sort((a, b) => b.totalAmount - a.totalAmount);

    },
    enabled: !!committeeId,
  });
};
