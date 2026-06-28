import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DonorRecord {
  id: string;
  name: string;
  display_name?: string | null;
  type: 'Individual' | 'PAC' | 'Organization' | 'Unknown';
  amount: number;
  cycle: string;
  candidate_id: string;
  recipient_committee_name?: string | null;
  recipient_committee_id?: string | null;
  employer?: string | null;
  occupation?: string | null;
  contributor_city?: string | null;
  contributor_state?: string | null;
  transaction_count?: number | null;
  is_conduit_org?: boolean | null;
  candidates?: {
    id: string;
    name: string;
    party: string;
    office: string;
    state: string;
    district?: string;
    image_url?: string;
  };
}

export interface ContributionRecord {
  id: string;
  contributor_name: string;
  amount: number;
  cycle: string;
  receipt_date: string | null;
  candidate_id: string | null;
  recipient_committee_id: string | null;
  recipient_committee_name: string | null;
  candidates?: {
    id: string;
    name: string;
    party: string;
    office: string;
    state: string;
  } | null;
}

export interface PACContributor {
  name: string;
  totalAmount: number;
  contributionCount: number;
  byCycle: Record<string, { totalAmount: number; contributionCount: number }>;
}

export interface CommitteeAlias {
  id: string;
  canonical_name: string;
  fec_committee_ids: string[];
  is_active: boolean;
}

// The fields of a donor_aliases row that DonorProfile reads. The query selects
// `donor_aliases!inner(*)`; only these are consumed.
export interface DonorAliasRow {
  id: string;
  canonical_name: string;
  fec_committee_id: string | null;
}

// Fetch the specific donor record.
export function useDonorRecord(id: string | undefined) {
  return useQuery({
    queryKey: ['donor', id],
    queryFn: async () => {
      if (!id) return null;
      // NJ state donors have a synthetic id ("njc:<contrib_s>") that isn't in the
      // federal `donors` table; resolve their identity from nj_elec_contributions.
      if (id.startsWith('njc:')) {
        const { data, error } = await supabase
          .from('nj_elec_contributions')
          .select('contrib_s, contributor, is_individual, contributor_type, city, state')
          .eq('contrib_s', Number(id.slice(4)))
          .maybeSingle();
        if (error) throw error;
        if (!data) return null;
        const ct = data.contributor_type || '';
        const njType: DonorRecord['type'] = data.is_individual
          ? 'Individual'
          : /PAC|CMTE|COMMITTEE|PARTY|POLITICAL/i.test(ct)
            ? 'PAC'
            : (!ct || ['NOT PROVIDED', 'MISC/ OTHER', 'INTEREST'].includes(ct))
              ? 'Unknown'
              : 'Organization';
        return {
          id,
          name: data.contributor || '',
          type: njType,
          amount: 0,
          cycle: '',
          candidate_id: '',
          contributor_city: data.city,
          contributor_state: data.state,
        } as DonorRecord;
      }
      const { data, error } = await supabase
        .from('donors')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as DonorRecord;
    },
    enabled: !!id,
  });
}

// Check if this donor has an alias via donor_alias_members.
export function useDonorAliasInfo(donor: DonorRecord | null | undefined) {
  return useQuery({
    queryKey: ['donor-alias-info', donor?.name, donor?.type],
    queryFn: async () => {
      if (!donor?.name || !donor?.type) return null;

      const { data, error } = await supabase
        .from('donor_alias_members')
        .select('alias_id, donor_aliases!inner(*)')
        .eq('donor_name', donor.name)
        .eq('donor_type', donor.type)
        .eq('donor_aliases.is_active', true)
        .maybeSingle();

      if (error) throw error;
      return ((data as { donor_aliases?: unknown } | null)?.donor_aliases as DonorAliasRow) || null;
    },
    enabled: !!donor?.name && !!donor?.type,
  });
}

// Get all member name variations for this alias.
export function useDonorNameVariations(
  aliasInfo: DonorAliasRow | null | undefined,
  donorType: string | undefined,
) {
  return useQuery({
    queryKey: ['donor-name-variations', aliasInfo?.id, donorType],
    queryFn: async () => {
      if (!aliasInfo?.id) return [] as string[];

      const { data, error } = await supabase
        .from('donor_alias_members')
        .select('donor_name')
        .eq('alias_id', aliasInfo.id);

      if (error) throw error;
      const uniqueNames = [...new Set((data || []).map((d: { donor_name: string }) => d.donor_name))];
      return uniqueNames.sort();
    },
    enabled: !!aliasInfo?.id,
  });
}

// Fetch all donor records with the same display name (across all types).
export function useDonorRecords(
  donor: DonorRecord | null | undefined,
  aliasInfo: DonorAliasRow | null | undefined,
  nameVariations: string[],
  displayName: string,
) {
  return useQuery({
    queryKey: ['donor-records', displayName, aliasInfo?.id, nameVariations.join('|')],
    queryFn: async () => {
      if (!donor?.name) return [] as DonorRecord[];

      let query = supabase
        .from('donors')
        .select(`*, candidates (id, name, party, office, state, district, image_url)`)
        .order('amount', { ascending: false });

      // PostgREST .or() treats commas as clause separators, so values that
      // contain commas (e.g. "ADELSON, MIRIAM") must be wrapped in double quotes.
      const q = (v: string) => `"${v.replace(/"/g, '\\"')}"`;

      if (aliasInfo?.id && nameVariations.length > 0) {
        query = query.in('name', nameVariations as string[]);
      } else if (aliasInfo?.canonical_name) {
        query = query.or(`name.eq.${q(donor.name)},display_name.eq.${q(aliasInfo.canonical_name)}`);
      } else {
        query = query.or(`name.eq.${q(donor.name)},display_name.eq.${q(donor.name)}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((row) => ({
        ...row,
        candidates: (row as { candidates?: unknown }).candidates,
      })) as DonorRecord[];
    },
    enabled: !!donor?.name,
  });
}

// Fetch individual contributions for detailed history (across all types).
export function useDonorContributions(
  donor: DonorRecord | null | undefined,
  aliasInfo: DonorAliasRow | null | undefined,
  displayName: string,
  showAllDonations: boolean,
  donorRecords: DonorRecord[],
) {
  return useQuery({
    queryKey: ['donor-contributions', displayName, aliasInfo?.id, showAllDonations, donorRecords.length],
    queryFn: async () => {
      if (!donor?.name || donorRecords.length === 0) return [] as ContributionRecord[];

      const donorNames = [...new Set(donorRecords.map(r => r.name).filter(Boolean))];

      let query = supabase
        .from('contributions')
        .select(`*, candidates (id, name, party, office, state)`)
        .order('receipt_date', { ascending: false })
        .limit(showAllDonations ? 5000 : 500);

      query = query.in('contributor_name', donorNames);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((row) => ({
        ...row,
        candidates: (row as { candidates?: unknown }).candidates,
      })) as ContributionRecord[];
    },
    enabled: !!donor?.name && donorRecords.length > 0,
  });
}

export function useActiveCommitteeAliases() {
  return useQuery({
    queryKey: ['active-committee-aliases'],
    queryFn: async (): Promise<CommitteeAlias[]> => {
      const { data, error } = await supabase
        .from('committee_aliases')
        .select('id, canonical_name, fec_committee_ids, is_active')
        .eq('is_active', true);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Contributors to this donor's own committees (PAC/Organization donors only).
export function useDonorPacContributors(
  donor: DonorRecord | null | undefined,
  aliasInfo: DonorAliasRow | null | undefined,
  displayName: string,
  nameVariations: string[],
  id: string | undefined,
) {
  return useQuery({
    queryKey: ['pac-contributors', id, donor?.name, displayName, aliasInfo?.id, nameVariations.join('|')],
    queryFn: async () => {
      if (!donor?.name || (donor.type !== 'PAC' && donor.type !== 'Organization')) return [] as PACContributor[];

      const candidateNames = [
        displayName,
        donor.name,
        ...nameVariations,
      ].filter(Boolean) as string[];
      const uniqueCandidateNames = [...new Set(candidateNames)];

      // Step 1: resolve this donor's own receiving committee IDs by
      // fuzzy-matching against donors.recipient_committee_name (the donor
      // itself may be "COINBASE" while the receiving committee is stored as
      // "COINBASE, INC. INNOVATION PAC (...)"). We use the `donors` table
      // because it's readable by all authenticated users (contributions is
      // admin-only).
      const resolvedCommitteeIds = new Set<string>();
      if (aliasInfo?.fec_committee_id) resolvedCommitteeIds.add(aliasInfo.fec_committee_id);

      for (const name of uniqueCandidateNames) {
        const trimmed = name.trim();
        if (!trimmed) continue;
        const { data: matches } = await supabase
          .from('donors')
          .select('recipient_committee_id')
          .ilike('recipient_committee_name', `${trimmed}%`)
          .not('recipient_committee_id', 'is', null)
          .limit(500);
        (matches || []).forEach((m: { recipient_committee_id: string | null }) => {
          if (m.recipient_committee_id) resolvedCommitteeIds.add(m.recipient_committee_id);
        });
      }

      if (resolvedCommitteeIds.size === 0) {
        return [] as PACContributor[];
      }

      // Step 2: pull contributions to those committees from the donors table.
      const { data, error } = await supabase
        .from('donors')
        .select('name, display_name, type, amount, transaction_count, cycle')
        .in('recipient_committee_id', Array.from(resolvedCommitteeIds))
        .order('amount', { ascending: false })
        .limit(5000);

      if (error) throw error;

      const grouped = new Map<string, PACContributor>();
      (data || []).forEach((row: { name?: string; display_name?: string; type?: string; amount?: number | string; transaction_count?: number | string; cycle?: string | number }) => {
        const contributorName = (row.display_name || row.name || '').trim();
        if (!contributorName) return;
        const amount = Number(row.amount || 0);
        const txns = Number(row.transaction_count || 1);
        const cycle = String(row.cycle || '');

        let entry = grouped.get(contributorName);
        if (!entry) {
          entry = {
            name: contributorName,
            totalAmount: 0,
            contributionCount: 0,
            byCycle: {},
          };
          grouped.set(contributorName, entry);
        }
        entry.totalAmount += amount;
        entry.contributionCount += txns;
        if (cycle) {
          const cur = entry.byCycle[cycle] || { totalAmount: 0, contributionCount: 0 };
          cur.totalAmount += amount;
          cur.contributionCount += txns;
          entry.byCycle[cycle] = cur;
        }
      });

      return Array.from(grouped.values()).sort((a, b) => b.totalAmount - a.totalAmount);
    },
    enabled: !!donor?.name && (donor?.type === 'PAC' || donor?.type === 'Organization'),
  });
}
