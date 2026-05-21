import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface IETotals {
  expenditure_count: number;
  total_amount: number;
  support_amount: number;
  oppose_amount: number;
}

export interface IERow {
  id: string;
  expenditure_date: string | null;
  amount: number;
  support_oppose_indicator: 'S' | 'O';
  purpose: string | null;
  spending_committee_fec_id: string;
  spending_committee_name: string | null;
  candidate_id: string | null;
  target_fec_candidate_id: string | null;
  target_candidate_name: string | null;
  cycle: string | null;
}

const num = (v: unknown) => Number(v ?? 0);

export const useCommitteeIE = (committeeFecId: string | null | undefined) => {
  return useQuery({
    queryKey: ['ie-committee-totals', committeeFecId],
    enabled: !!committeeFecId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const [totalsRes, rowsRes] = await Promise.all([
        supabase
          .from('committee_independent_expenditure_totals')
          .select('expenditure_count, total_amount, support_amount, oppose_amount')
          .eq('spending_committee_fec_id', committeeFecId!)
          .maybeSingle(),
        supabase
          .from('independent_expenditures')
          .select(
            'id, expenditure_date, amount, support_oppose_indicator, purpose, spending_committee_fec_id, spending_committee_name, candidate_id, target_fec_candidate_id, target_candidate_name, cycle',
          )
          .eq('spending_committee_fec_id', committeeFecId!)
          .order('expenditure_date', { ascending: false })
          .limit(25),
      ]);
      const t = totalsRes.data;
      const totals: IETotals = {
        expenditure_count: num(t?.expenditure_count),
        total_amount: num(t?.total_amount),
        support_amount: num(t?.support_amount),
        oppose_amount: num(t?.oppose_amount),
      };
      return { totals, rows: (rowsRes.data ?? []) as IERow[] };
    },
  });
};

export const useCandidateIE = (candidateId: string | null | undefined) => {
  return useQuery({
    queryKey: ['ie-candidate-totals', candidateId],
    enabled: !!candidateId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const [totalsRes, rowsRes] = await Promise.all([
        supabase
          .from('candidate_independent_expenditure_totals')
          .select('expenditure_count, total_amount, support_amount, oppose_amount')
          .eq('candidate_id', candidateId!)
          .maybeSingle(),
        supabase
          .from('independent_expenditures')
          .select(
            'id, expenditure_date, amount, support_oppose_indicator, purpose, spending_committee_fec_id, spending_committee_name, candidate_id, target_fec_candidate_id, target_candidate_name, cycle',
          )
          .eq('candidate_id', candidateId!)
          .order('amount', { ascending: false })
          .limit(50),
      ]);
      const t = totalsRes.data;
      const totals: IETotals = {
        expenditure_count: num(t?.expenditure_count),
        total_amount: num(t?.total_amount),
        support_amount: num(t?.support_amount),
        oppose_amount: num(t?.oppose_amount),
      };
      const rows = (rowsRes.data ?? []) as IERow[];
      // Aggregate top spenders
      const spenderMap = new Map<
        string,
        { name: string; support: number; oppose: number; total: number; count: number }
      >();
      rows.forEach((r) => {
        const key = r.spending_committee_fec_id;
        const cur =
          spenderMap.get(key) ??
          { name: r.spending_committee_name ?? key, support: 0, oppose: 0, total: 0, count: 0 };
        cur.total += num(r.amount);
        cur.count += 1;
        if (r.support_oppose_indicator === 'S') cur.support += num(r.amount);
        else cur.oppose += num(r.amount);
        spenderMap.set(key, cur);
      });
      const topSpenders = Array.from(spenderMap.entries())
        .map(([fecId, v]) => ({ fecId, ...v }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
      return { totals, rows, topSpenders };
    },
  });
};

export type IETotalsMap = Map<string, IETotals>;

export const useCandidatesIE = (candidateIds: string[]) => {
  const sortedKey = [...candidateIds].sort().join(',');
  return useQuery({
    queryKey: ['ie-candidates-bulk', sortedKey],
    enabled: candidateIds.length > 0,
    staleTime: 1000 * 60 * 10,
    queryFn: async (): Promise<IETotalsMap> => {
      const { data, error } = await supabase
        .from('candidate_independent_expenditure_totals')
        .select('candidate_id, expenditure_count, total_amount, support_amount, oppose_amount')
        .in('candidate_id', candidateIds);
      if (error) throw error;
      const map: IETotalsMap = new Map();
      (data ?? []).forEach((row) => {
        if (!row.candidate_id) return;
        const cur = map.get(row.candidate_id) ?? {
          expenditure_count: 0,
          total_amount: 0,
          support_amount: 0,
          oppose_amount: 0,
        };
        cur.expenditure_count += num(row.expenditure_count);
        cur.total_amount += num(row.total_amount);
        cur.support_amount += num(row.support_amount);
        cur.oppose_amount += num(row.oppose_amount);
        map.set(row.candidate_id, cur);
      });
      return map;
    },
  });
};

