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
        .select('contrib_s, cont_amt, cand_name, election_year, cont_date, contribution_type')
        .in('contributor', cleaned)
        .order('cont_amt', { ascending: false })
        .limit(5000);
      if (error) throw error;

      const recipients = new Map<string, NjRecipientSummary>();
      const contributions: NjContributionRow[] = [];
      const cycles = new Set<string>();
      let total = 0;

      for (const r of (data || []) as Array<{
        contrib_s: number;
        cont_amt: number | string | null;
        cand_name: string | null;
        election_year: number | null;
        cont_date: string | null;
        contribution_type: string | null;
      }>) {
        const amount = Number(r.cont_amt || 0);
        const recipient = (r.cand_name || 'Unknown').trim() || 'Unknown';
        total += amount;
        if (r.election_year != null) cycles.add(String(r.election_year));

        const existing = recipients.get(recipient);
        if (existing) {
          existing.amount += amount;
          existing.count += 1;
        } else {
          recipients.set(recipient, { name: recipient, amount, count: 1 });
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

      return {
        total,
        transactionCount: contributions.length,
        recipients: Array.from(recipients.values()).sort((a, b) => b.amount - a.amount),
        contributions,
        cycles: Array.from(cycles).sort().reverse(),
      };
    },
    enabled: cleaned.length > 0,
  });
};
