import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CommitteeSummary {
  id: string;
  name: string | null;
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
  donorCount: number;
  contributionCount: number;
  totalRaised: number;
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
) => {
  const rollupByKey = new Map<string, CommitteeRollupRow>();
  const rollupByCommittee = new Map<string, CommitteeRollupRow[]>();

  rollups.forEach((row) => {
    const key = `${row.committee_id}-${row.candidate_id || 'unknown'}`;
    rollupByKey.set(key, row);
    const list = rollupByCommittee.get(row.committee_id) || [];
    list.push(row);
    rollupByCommittee.set(row.committee_id, list);
  });

  return committees.map((committee) => {
    const rollup =
      rollupByKey.get(`${committee.fec_committee_id}-${committee.candidate_id || 'unknown'}`) ||
      (rollupByCommittee.get(committee.fec_committee_id) || [])[0];

    const totalRaised =
      rollup?.local_itemized ??
      rollup?.fec_total_receipts ??
      rollup?.fec_itemized ??
      committee.local_itemized_total ??
      committee.fec_itemized_total ??
      0;

    return {
      id: committee.id,
      name: committee.name,
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
      donorCount: rollup?.donor_count ?? 0,
      contributionCount: rollup?.contribution_count ?? 0,
      totalRaised,
    } as CommitteeSummary;
  });
};

async function fetchCommittees(cycle = '2024', committeeId?: string) {
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
    `)
    .returns<CommitteeRow[]>()
    .order('name', { ascending: true });

  if (committeeId) {
    committeeQuery = committeeQuery.eq('fec_committee_id', committeeId);
  }

  const { data: committees, error: committeeError } = await committeeQuery;
  if (committeeError) throw committeeError;

  const committeeIds = (committees || []).map((c) => c.fec_committee_id).filter(Boolean);

  let rollups: CommitteeRollupRow[] = [];
  if (committeeIds.length > 0) {
    const { data: rollupData, error: rollupError } = await supabase
      .from('committee_finance_rollups')
      .select('committee_id, candidate_id, donor_count, contribution_count, local_itemized, fec_itemized, fec_total_receipts')
      .returns<CommitteeRollupRow[]>()
      .in('committee_id', committeeIds)
      .eq('cycle', cycle);

    if (rollupError) throw rollupError;
    rollups = rollupData || [];
  }

  return buildCommitteeSummaries(committees, rollups);
}

export const useCommittees = (cycle = '2024') => {
  return useQuery({
    queryKey: ['committees', cycle],
    queryFn: () => fetchCommittees(cycle),
  });
};

export const useCommittee = (committeeId: string | undefined, cycle = '2024') => {
  return useQuery({
    queryKey: ['committee', committeeId, cycle],
    queryFn: async () => {
      if (!committeeId) return null;
      const committees = await fetchCommittees(cycle, committeeId);
      return committees[0] || null;
    },
    enabled: !!committeeId,
  });
};

export const useCommitteeDonors = (committeeId: string | undefined, cycle = '2024') => {
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
        candidates: {
          id: string;
          name: string;
          party: string;
          office: string;
          state: string;
        } | null;
      }

      const { data, error } = await supabase
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
          candidate_id,
          candidates:candidate_id (
            id,
            name,
            party,
            office,
            state
          )
        `)
        .returns<ContributionRow[]>()
        .eq('recipient_committee_id', committeeId)
        .eq('cycle', cycle)
        .order('amount', { ascending: false })
        .limit(500);

      if (error) throw error;

      const donorMap = new Map<string, CommitteeDonor>();

      (data || []).forEach((row) => {
        const key = `${row.contributor_name}-${row.contributor_state || ''}-${row.contributor_city || ''}`;
        const existing = donorMap.get(key);
        const candidateNames = new Set(existing?.candidateNames || []);
        if (row.candidates?.name) {
          candidateNames.add(row.candidates.name);
        }

        const existingDate = existing?.latestDate ? new Date(existing.latestDate) : null;
        const currentDate = row.receipt_date ? new Date(row.receipt_date) : null;
        const latestDate =
          existingDate && currentDate
            ? (existingDate > currentDate ? existing.latestDate : row.receipt_date)
            : currentDate
              ? row.receipt_date
              : existing?.latestDate || null;

        donorMap.set(key, {
          id: existing?.id || row.id,
          name: row.contributor_name,
          totalAmount: (existing?.totalAmount || 0) + (row.amount || 0),
          contributionCount: (existing?.contributionCount || 0) + 1,
          latestDate,
          city: row.contributor_city || existing?.city || null,
          state: row.contributor_state || existing?.state || null,
          occupation: row.occupation || existing?.occupation || null,
          employer: row.employer || existing?.employer || null,
          candidateNames: Array.from(candidateNames),
        });
      });

      return Array.from(donorMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);
    },
    enabled: !!committeeId,
  });
};
