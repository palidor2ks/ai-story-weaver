import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface IETotals {
  expenditure_count: number;
  total_amount: number;
  support_amount: number;
  oppose_amount: number;
  cycle?: string | null;
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

export interface IETargetSummary {
  key: string;
  name: string;
  fecId: string | null;
  candidateId: string | null;
  party: string | null;
  support: number;
  oppose: number;
  total: number;
  count: number;
}

export const useCommitteeIE = (
  committeeFecId: string | null | undefined,
  cycle?: string | null,
) => {
  return useQuery({
    queryKey: ['ie-committee-summary', committeeFecId, cycle ?? 'all'],
    enabled: !!committeeFecId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      // Cycles list (unfiltered, for stable dropdown)
      const cyclesRes = await supabase
        .from('independent_expenditures')
        .select('cycle')
        .eq('spending_committee_fec_id', committeeFecId!)
        .not('cycle', 'is', null);
      const availableCycles = Array.from(
        new Set((cyclesRes.data ?? []).map((r) => String(r.cycle))),
      ).sort((a, b) => b.localeCompare(a));

      // Filtered rows
      let q = supabase
        .from('independent_expenditures')
        .select(
          'id, amount, support_oppose_indicator, candidate_id, target_fec_candidate_id, target_candidate_name, cycle',
        )
        .eq('spending_committee_fec_id', committeeFecId!);
      if (cycle && cycle !== 'all') q = q.eq('cycle', cycle);
      const rowsRes = await q.limit(50000);
      const rows = (rowsRes.data ?? []) as Array<{
        amount: number | string;
        support_oppose_indicator: 'S' | 'O';
        candidate_id: string | null;
        target_fec_candidate_id: string | null;
        target_candidate_name: string | null;
      }>;

      const totals: IETotals = {
        expenditure_count: rows.length,
        total_amount: 0,
        support_amount: 0,
        oppose_amount: 0,
      };
      const map = new Map<string, IETargetSummary>();
      rows.forEach((r) => {
        const amt = num(r.amount);
        totals.total_amount += amt;
        if (r.support_oppose_indicator === 'S') totals.support_amount += amt;
        else totals.oppose_amount += amt;

        const key =
          r.target_fec_candidate_id ?? r.candidate_id ?? r.target_candidate_name ?? 'unknown';
        const cur: IETargetSummary =
          map.get(key) ??
          {
            key,
            name: r.target_candidate_name ?? r.target_fec_candidate_id ?? 'Unknown target',
            fecId: r.target_fec_candidate_id,
            candidateId: r.candidate_id,
            party: null,
            support: 0,
            oppose: 0,
            total: 0,
            count: 0,
          };
        cur.total += amt;
        cur.count += 1;
        if (r.support_oppose_indicator === 'S') cur.support += amt;
        else cur.oppose += amt;
        if (!cur.candidateId && r.candidate_id) cur.candidateId = r.candidate_id;
        map.set(key, cur);
      });
      const targets = Array.from(map.values()).sort((a, b) => b.total - a.total);

      // Fetch party for candidate targets
      const candIds = Array.from(new Set(targets.map((t) => t.candidateId).filter(Boolean) as string[]));
      const fecIds = Array.from(new Set(targets.map((t) => t.fecId).filter(Boolean) as string[]));
      if (candIds.length || fecIds.length) {
        const filters: string[] = [];
        if (candIds.length) filters.push(`id.in.(${candIds.join(',')})`);
        if (fecIds.length) filters.push(`fec_id.in.(${fecIds.join(',')})`);
        const { data: cands } = await supabase
          .from('candidates')
          .select('id, fec_id, party')
          .or(filters.join(','));
        const byId = new Map<string, { id: string; party: string | null }>();
        const byFec = new Map<string, { id: string; party: string | null }>();
        // `fec_id` isn't in the generated types for `candidates`, so the typed
        // builder resolves this select to a SelectQueryError — cast to the real shape.
        ((cands ?? []) as unknown as Array<{ id: string; fec_id: string | null; party: string | null }>).forEach((c) => {
          if (c.id) byId.set(c.id, { id: c.id, party: c.party ?? null });
          if (c.fec_id) byFec.set(c.fec_id, { id: c.id, party: c.party ?? null });
        });
        targets.forEach((t) => {
          const byIdMatch = t.candidateId ? byId.get(t.candidateId) : undefined;
          const byFecMatch = t.fecId ? byFec.get(t.fecId) : undefined;
          t.party = byIdMatch?.party ?? byFecMatch?.party ?? null;
          if (!t.candidateId && byFecMatch?.id) t.candidateId = byFecMatch.id;
        });
      }

      return { totals, targets, availableCycles };
    },
  });
};

export const useCandidateIE = (
  candidateId: string | null | undefined,
  cycle?: string | null,
) => {
  return useQuery({
    queryKey: ['ie-candidate-totals', candidateId, cycle ?? 'all'],
    enabled: !!candidateId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const filtered = !!cycle && cycle !== 'all';

      let rowsQ = supabase
        .from('independent_expenditures')
        .select(
          'id, expenditure_date, amount, support_oppose_indicator, purpose, spending_committee_fec_id, spending_committee_name, candidate_id, target_fec_candidate_id, target_candidate_name, cycle',
        )
        .eq('candidate_id', candidateId!)
        .order('amount', { ascending: false });
      if (filtered) rowsQ = rowsQ.eq('cycle', cycle!);
      else rowsQ = rowsQ.limit(50);

      const [totalsRes, rowsRes, cyclesRes] = await Promise.all([
        filtered
          ? Promise.resolve({ data: null })
          : supabase
              .from('candidate_independent_expenditure_totals')
              .select('expenditure_count, total_amount, support_amount, oppose_amount')
              .eq('candidate_id', candidateId!)
              .maybeSingle(),
        rowsQ,
        supabase
          .from('independent_expenditures')
          .select('cycle')
          .eq('candidate_id', candidateId!)
          .not('cycle', 'is', null),
      ]);

      const rows = (rowsRes.data ?? []) as IERow[];

      let totals: IETotals;
      if (filtered) {
        totals = { expenditure_count: rows.length, total_amount: 0, support_amount: 0, oppose_amount: 0 };
        rows.forEach((r) => {
          const amt = num(r.amount);
          totals.total_amount += amt;
          if (r.support_oppose_indicator === 'S') totals.support_amount += amt;
          else totals.oppose_amount += amt;
        });
      } else {
        const t = (totalsRes as { data?: { expenditure_count?: number; total_amount?: number; support_amount?: number; oppose_amount?: number } | null }).data;
        totals = {
          expenditure_count: num(t?.expenditure_count),
          total_amount: num(t?.total_amount),
          support_amount: num(t?.support_amount),
          oppose_amount: num(t?.oppose_amount),
        };
      }

      const availableCycles = Array.from(
        new Set((cyclesRes.data ?? []).map((r) => String(r.cycle))),
      ).sort((a, b) => b.localeCompare(a));

      // Aggregate top spenders from rows
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
      return { totals, rows, topSpenders, availableCycles };
    },
  });
};


export type IETotalsMap = Map<string, IETotals>;

export const useCandidatesIE = (candidateIds: string[]) => {
  const sortedKey = [...candidateIds].sort().join(',');
  return useQuery({
    queryKey: ['ie-candidates-bulk-latest-cycle', sortedKey],
    enabled: candidateIds.length > 0,
    staleTime: 1000 * 60 * 10,
    queryFn: async (): Promise<IETotalsMap> => {
      const { data, error } = await supabase
        .from('independent_expenditures')
        .select('candidate_id, amount, support_oppose_indicator, cycle')
        .in('candidate_id', candidateIds)
        .limit(50000);
      if (error) throw error;

      // Group by candidate_id -> cycle -> totals
      const byCand = new Map<string, Map<string, IETotals>>();
      (data ?? []).forEach((r) => {
        if (!r.candidate_id) return;
        const cycle = r.cycle ? String(r.cycle) : '';
        const cyclesMap = byCand.get(r.candidate_id) ?? new Map<string, IETotals>();
        const cur = cyclesMap.get(cycle) ?? {
          expenditure_count: 0,
          total_amount: 0,
          support_amount: 0,
          oppose_amount: 0,
          cycle: cycle || null,
        };
        const amt = num(r.amount);
        cur.expenditure_count += 1;
        cur.total_amount += amt;
        if (r.support_oppose_indicator === 'S') cur.support_amount += amt;
        else cur.oppose_amount += amt;
        cyclesMap.set(cycle, cur);
        byCand.set(r.candidate_id, cyclesMap);
      });

      const map: IETotalsMap = new Map();
      byCand.forEach((cyclesMap, candId) => {
        const latest = Array.from(cyclesMap.keys()).sort((a, b) => b.localeCompare(a))[0];
        const t = cyclesMap.get(latest);
        if (t) map.set(candId, t);
      });
      return map;
    },
  });
};


