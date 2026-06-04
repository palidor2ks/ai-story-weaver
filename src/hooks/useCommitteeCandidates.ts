// Resolves committees that are tied to exactly ONE candidate (principal /
// authorized / single-candidate joint-fundraising committees). For these, the
// committee's "primary cause" is the candidate themselves — showing a generic
// "Conservative/Progressive (general)" bucket is both redundant and less useful
// than naming the candidate. Derived from the existing `candidate_committees`
// linkage (same source `useCommittees` uses), so no schema change is required.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CommitteePrimaryCandidate {
  id: string;
  name: string;
  party: string | null;
  office: string | null;
  state: string | null;
}

const fetchPrimaryCandidates = async (ids: string[]) => {
  const map = new Map<string, CommitteePrimaryCandidate>();
  if (ids.length === 0) return map;

  const { data, error } = await supabase
    .from('candidate_committees')
    .select('fec_committee_id, candidate_id, candidates:candidate_id(id, name, party, office, state)')
    .in('fec_committee_id', ids)
    .not('candidate_id', 'is', null);
  if (error) throw error;

  // Group rows by committee, collecting the distinct candidates linked to each.
  const byCommittee = new Map<string, Map<string, CommitteePrimaryCandidate>>();
  for (const row of (data ?? []) as any[]) {
    const cand = row.candidates;
    if (!row.fec_committee_id || !cand?.id) continue;
    const inner = byCommittee.get(row.fec_committee_id) ?? new Map<string, CommitteePrimaryCandidate>();
    inner.set(cand.id, {
      id: cand.id,
      name: cand.name,
      party: cand.party ?? null,
      office: cand.office ?? null,
      state: cand.state ?? null,
    });
    byCommittee.set(row.fec_committee_id, inner);
  }

  // Keep only committees linked to exactly one candidate.
  byCommittee.forEach((cands, fecId) => {
    if (cands.size === 1) map.set(fecId, Array.from(cands.values())[0]);
  });
  return map;
};

/** Bulk variant for lists — one query for all visible committees (no N+1). */
export const useCommitteePrimaryCandidatesMap = (fecCommitteeIds: (string | null | undefined)[]) => {
  const ids = Array.from(new Set(fecCommitteeIds.filter(Boolean) as string[])).sort();
  return useQuery({
    queryKey: ['committee-primary-candidates', ids],
    enabled: ids.length > 0,
    staleTime: 1000 * 60 * 10,
    queryFn: () => fetchPrimaryCandidates(ids),
  });
};

/** Single-committee variant for standalone badges (e.g. the committee profile). */
export const useCommitteePrimaryCandidate = (fecCommitteeId: string | null | undefined) => {
  return useQuery({
    queryKey: ['committee-primary-candidate', fecCommitteeId],
    enabled: !!fecCommitteeId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => (await fetchPrimaryCandidates([fecCommitteeId!])).get(fecCommitteeId!) ?? null,
  });
};
