import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// NJ state (ELEC) giving for a donor, matched by contributor name(s).
// nj_elec_contributions is public-read, so this runs client-side. Donors are
// matched on the same name variations the federal alias system already resolves,
// so a curated cross-source alias surfaces a donor's NJ giving here automatically.

export interface NjRecipientSummary {
  name: string;
  amount: number;
  count: number;
  // Best-effort context from nj_elec_entities (null when the entity can't be matched).
  office: string | null;
  party: string | null;
  district: string | null;
}

export interface NjContributionRow {
  id: number;
  recipient: string;
  amount: number;
  year: number | null;
  date: string | null;
  contributionType: string | null;
}

export interface NjDonorGiving {
  total: number;
  transactionCount: number;
  recipients: NjRecipientSummary[];
  contributions: NjContributionRow[];
  cycles: string[];
}

const EMPTY: NjDonorGiving = {
  total: 0,
  transactionCount: 0,
  recipients: [],
  contributions: [],
  cycles: [],
};

export const useNjDonorGiving = (names: string[]) => {
  const cleaned = [...new Set((names || []).map((n) => (n || '').trim()).filter(Boolean))];

  return useQuery<NjDonorGiving>({
    queryKey: ['nj-donor-giving', cleaned.slice().sort().join('|')],
    queryFn: async () => {
      if (cleaned.length === 0) return EMPTY;

      const { data, error } = await supabase
        .from('nj_elec_contributions')
        .select('contrib_s, cont_amt, cand_name, entity_s, election_year, cont_date, contribution_type')
        .in('contributor', cleaned)
        .order('cont_amt', { ascending: false })
        .limit(5000);
      if (error) throw error;

      // Per-recipient accumulator; tracks the entity from the most recent gift so we
      // can attach office/party/district context below.
      interface RecipientAccum {
        name: string;
        amount: number;
        count: number;
        entityS: string | null;
        entityYear: number | null;
      }
      const recipients = new Map<string, RecipientAccum>();
      const contributions: NjContributionRow[] = [];
      const cycles = new Set<string>();
      const entityIds = new Set<string>();
      let total = 0;

      for (const r of (data || []) as Array<{
        contrib_s: number;
        cont_amt: number | string | null;
        cand_name: string | null;
        entity_s: string | null;
        election_year: number | null;
        cont_date: string | null;
        contribution_type: string | null;
      }>) {
        const amount = Number(r.cont_amt || 0);
        const recipient = (r.cand_name || 'Unknown').trim() || 'Unknown';
        total += amount;
        if (r.election_year != null) cycles.add(String(r.election_year));
        if (r.entity_s) entityIds.add(r.entity_s);

        const existing = recipients.get(recipient);
        if (existing) {
          existing.amount += amount;
          existing.count += 1;
          if (r.entity_s && (existing.entityYear == null || (r.election_year ?? -Infinity) >= existing.entityYear)) {
            existing.entityS = r.entity_s;
            existing.entityYear = r.election_year ?? existing.entityYear;
          }
        } else {
          recipients.set(recipient, {
            name: recipient,
            amount,
            count: 1,
            entityS: r.entity_s ?? null,
            entityYear: r.election_year ?? null,
          });
        }

        contributions.push({
          id: Number(r.contrib_s),
          recipient,
          amount,
          year: r.election_year ?? null,
          date: r.cont_date ?? null,
          contributionType: r.contribution_type ?? null,
        });
      }

      // Enrich recipients with office/party/district. Best-effort: a failure or an
      // unmatched entity just leaves those fields null.
      const entityMap = new Map<string, { office: string | null; party: string | null; location: string | null }>();
      if (entityIds.size > 0) {
        const { data: entityRows } = await supabase
          .from('nj_elec_entities')
          .select('entity_s, office, party, location')
          .in('entity_s', Array.from(entityIds));
        for (const e of (entityRows || []) as Array<{
          entity_s: string;
          office: string | null;
          party: string | null;
          location: string | null;
        }>) {
          entityMap.set(e.entity_s, { office: e.office, party: e.party, location: e.location });
        }
      }

      const recipientSummaries: NjRecipientSummary[] = Array.from(recipients.values())
        .map((r) => {
          const e = r.entityS ? entityMap.get(r.entityS) : undefined;
          return {
            name: r.name,
            amount: r.amount,
            count: r.count,
            office: e?.office ?? null,
            party: e?.party ?? null,
            district: e?.location ?? null,
          };
        })
        .sort((a, b) => b.amount - a.amount);

      return {
        total,
        transactionCount: contributions.length,
        recipients: recipientSummaries,
        contributions,
        cycles: Array.from(cycles).sort().reverse(),
      };
    },
    enabled: cleaned.length > 0,
  });
};
