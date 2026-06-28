import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TopDonor {
  name: string;
  amount: number;
}

export interface FinanceSnapshot {
  candidateId: string;
  totalRaised: number;
  donorCount: number;
  smallDonationAmount: number;
  smallDonationCount: number;
  topDonors: TopDonor[];
}

const SMALL_DONATION_THRESHOLD = 200;
// Designations excluded from a candidate's primary fundraising totals
// (Joint, Unauthorized, Leadership PAC / Buddy committees, etc.).
const EXCLUDED_DESIGNATIONS = new Set(['J', 'U', 'B', 'D']);

/**
 * Per-candidate fundraising snapshots for the compare panel: total raised and
 * donor count (from authorized/principal committee rollups), plus top donors
 * and small-dollar totals when `includeDonorDetail` is set (the donors table is
 * auth-gated). Behaviour is identical to the inline query this replaced — the
 * query key intentionally omits `includeDonorDetail` to preserve the original
 * caching shape.
 */
export function useCompareFinanceSnapshots(
  candidateIds: string[],
  cycle: string | undefined,
  includeDonorDetail: boolean,
) {
  return useQuery({
    queryKey: ['compare-finance-snapshot', cycle ?? 'latest', candidateIds.join(',')],
    enabled: candidateIds.length > 0 && !!cycle,
    staleTime: 1000 * 60 * 10,
    queryFn: async (): Promise<Record<string, FinanceSnapshot>> => {
      const snapshots: Record<string, FinanceSnapshot> = Object.fromEntries(
        candidateIds.map((id) => [
          id,
          { candidateId: id, totalRaised: 0, donorCount: 0, smallDonationAmount: 0, smallDonationCount: 0, topDonors: [] },
        ]),
      );

      // 1) Authorized/principal committees only.
      const { data: committees, error: committeeError } = await supabase
        .from('candidate_committees')
        .select('candidate_id, fec_committee_id, designation')
        .in('candidate_id', candidateIds);
      if (committeeError) throw committeeError;

      const committeesByCandidate = new Map<string, string[]>();
      (committees ?? []).forEach((row) => {
        if (!row.candidate_id || !row.fec_committee_id) return;
        if (row.designation && EXCLUDED_DESIGNATIONS.has(row.designation)) return;
        const list = committeesByCandidate.get(row.candidate_id) ?? [];
        list.push(row.fec_committee_id);
        committeesByCandidate.set(row.candidate_id, list);
      });

      const allCommitteeIds = Array.from(
        new Set(Array.from(committeesByCandidate.values()).flat()),
      );
      if (allCommitteeIds.length === 0) return snapshots;

      // 2) Per-cycle rollups: totalRaised = sum( max(local_itemized, fec_total_receipts) ),
      //    donorCount = sum(donor_count).
      const { data: rollups, error: rollupError } = await supabase
        .from('committee_finance_rollups')
        .select('committee_id, candidate_id, local_itemized, fec_total_receipts, donor_count, cycle')
        .in('committee_id', allCommitteeIds)
        .eq('cycle', cycle!);
      if (rollupError) throw rollupError;

      const committeeOwner = new Map<string, string>();
      committeesByCandidate.forEach((ids, candidateId) => {
        ids.forEach((id) => committeeOwner.set(id, candidateId));
      });

      (rollups ?? []).forEach((row) => {
        const owner = row.candidate_id ?? committeeOwner.get(row.committee_id);
        if (!owner || !snapshots[owner]) return;
        const local = Number(row.local_itemized ?? 0);
        const fec = Number(row.fec_total_receipts ?? 0);
        snapshots[owner].totalRaised += Math.max(local, fec);
        snapshots[owner].donorCount += Number(row.donor_count ?? 0);
      });

      // 3) Top donors + small-dollar (auth-only because `donors`/`contributions` are not public).
      if (includeDonorDetail) {
        await Promise.all(
          Array.from(committeesByCandidate.entries()).map(async ([candidateId, ids]) => {
            const { data: donors } = await supabase
              .from('donors')
              .select('display_name, name, amount, type, recipient_committee_id, conduit_committee_id')
              .in('recipient_committee_id', ids)
              .eq('cycle', cycle!)
              .eq('is_conduit_org', false)
              .is('conduit_committee_id', null)
              .order('amount', { ascending: false })
              .limit(75);

            const aggregate = new Map<string, number>();
            let smallAmount = 0;
            let smallCount = 0;
            (donors ?? []).forEach((row) => {
              const amount = Number(row.amount ?? 0);
              const name = (row.display_name || row.name || 'Unknown').trim();
              aggregate.set(name, (aggregate.get(name) ?? 0) + amount);
              if (row.type === 'Individual' && amount <= SMALL_DONATION_THRESHOLD) {
                smallAmount += amount;
                smallCount += 1;
              }
            });

            snapshots[candidateId].topDonors = Array.from(aggregate.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([name, amount]) => ({ name, amount }));
            snapshots[candidateId].smallDonationAmount = smallAmount;
            snapshots[candidateId].smallDonationCount = smallCount;
          }),
        );
      }

      return snapshots;
    },
  });
}
