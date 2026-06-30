import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type Stance = 'all' | 'support' | 'oppose';

export interface SpenderRow {
  spending_committee_fec_id: string;
  spending_committee_name: string | null;
  searchableNames?: string[];
  expenditure_count: number;
  total_amount: number;
  support_amount: number;
  oppose_amount: number;
}

const num = (v: unknown) => Number(v ?? 0);

async function resolveDisplayNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return map;

  const [{ data: externalNames }, { data: aliases }] = await Promise.all([
    supabase
      .from('external_pacs')
      .select('fec_committee_id, name')
      .in('fec_committee_id', unique),
    supabase
      .from('committee_aliases')
      .select('canonical_name, fec_committee_ids, is_active')
      .overlaps('fec_committee_ids', unique),
  ]);

  (externalNames ?? []).forEach((r: { fec_committee_id: string; name: string | null }) => {
    if (r.name) map.set(r.fec_committee_id, r.name);
  });

  // Admin-managed aliases take precedence over external_pacs.name.
  ((aliases ?? []) as Array<{ canonical_name: string; fec_committee_ids: string[]; is_active: boolean }>).forEach(
    (r) => {
      if (!r.is_active || !r.canonical_name) return;
      r.fec_committee_ids.forEach((id) => {
        if (unique.includes(id)) map.set(id, r.canonical_name);
      });
    },
  );

  return map;
}

export const useTopSpenders = (cycle: string | 'all', stance: Stance, excludedIds: string[]) => {
  const excludedKey = [...excludedIds].sort().join(',');
  const excludedSet = new Set(excludedIds);
  return useQuery({
    queryKey: ['top-spenders', cycle, stance, excludedKey],
    staleTime: 1000 * 60 * 10,
    queryFn: async (): Promise<SpenderRow[]> => {
      let rows: SpenderRow[];
      // If a specific cycle is selected we must aggregate from the base table.
      // Otherwise we can use the pre-aggregated view for speed.
      if (cycle === 'all' && stance === 'all') {
        const { data, error } = await supabase
          .from('committee_independent_expenditure_totals')
          .select('spending_committee_fec_id, spending_committee_name, expenditure_count, total_amount, support_amount, oppose_amount')
          .order('total_amount', { ascending: false })
          .limit(200);
        if (error) throw error;
        rows = (data ?? [])
          .filter((r) => !excludedSet.has(r.spending_committee_fec_id))
          .slice(0, 100)
          .map((r) => ({
            spending_committee_fec_id: r.spending_committee_fec_id,
            spending_committee_name: r.spending_committee_name,
            searchableNames: [r.spending_committee_name ?? ""].filter(Boolean),
            expenditure_count: num(r.expenditure_count),
            total_amount: num(r.total_amount),
            support_amount: num(r.support_amount),
            oppose_amount: num(r.oppose_amount),
          }));
      } else {
        // Aggregate from base table with filters.
        let q = supabase
          .from('independent_expenditures')
          .select('spending_committee_fec_id, spending_committee_name, amount, support_oppose_indicator, cycle')
          .limit(50000);
        if (cycle !== 'all') q = q.eq('cycle', cycle);
        if (stance === 'support') q = q.eq('support_oppose_indicator', 'S');
        if (stance === 'oppose') q = q.eq('support_oppose_indicator', 'O');

        const { data, error } = await q;
        if (error) throw error;

        const map = new Map<string, SpenderRow>();
        (data ?? []).forEach((r) => {
          const key = r.spending_committee_fec_id;
          if (!key) return;
          if (excludedSet.has(key)) return;
          const cur = map.get(key) ?? {
            spending_committee_fec_id: key,
            spending_committee_name: r.spending_committee_name ?? null,
            searchableNames: [r.spending_committee_name ?? ""].filter(Boolean),
            expenditure_count: 0,
            total_amount: 0,
            support_amount: 0,
            oppose_amount: 0,
          };
          const amt = num(r.amount);
          cur.expenditure_count += 1;
          cur.total_amount += amt;
          if (r.support_oppose_indicator === 'S') cur.support_amount += amt;
          else if (r.support_oppose_indicator === 'O') cur.oppose_amount += amt;
          if (r.spending_committee_name && !cur.searchableNames?.includes(r.spending_committee_name)) {
            cur.searchableNames = [...(cur.searchableNames ?? []), r.spending_committee_name];
          }
          if (!cur.spending_committee_name && r.spending_committee_name) {
            cur.spending_committee_name = r.spending_committee_name;
          }
          map.set(key, cur);
        });
        rows = Array.from(map.values())
          .sort((a, b) => b.total_amount - a.total_amount)
          .slice(0, 100);
      }

      // Override short/abbreviated IE filer names with the registered FEC committee
      // name when we have it in external_pacs (e.g. "HMP" → "HOUSE MAJORITY PAC").
      const nameMap = await resolveDisplayNames(rows.map((r) => r.spending_committee_fec_id));
      return rows.map((r) => {
        const better = nameMap.get(r.spending_committee_fec_id);
        if (!better) return r;
        const current = r.spending_committee_name ?? '';
        // Prefer external_pacs name if current is empty or noticeably shorter (likely an abbreviation).
        const searchableNames = Array.from(new Set([...(r.searchableNames ?? []), current, better].filter(Boolean)));
        if (!current || better.length > current.length + 2) {
          return { ...r, spending_committee_name: better, searchableNames };
        }
        return { ...r, searchableNames };
      });
    },
  });
};

export const useIECycles = () => {
  return useQuery({
    queryKey: ['ie-cycles'],
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('independent_expenditure_cycles')
        .select('cycle');
      if (error) throw error;
      const set = new Set<string>();
      ((data ?? []) as Array<{ cycle: string | null }>).forEach((r) => r.cycle && set.add(r.cycle));
      return Array.from(set).sort((a, b) => b.localeCompare(a));
    },
  });
};

// Batched lookup: receipts (raised) for visible spender rows from committee_finance_rollups.
export const useTopSpendersRaised = (visibleIds: string[]) => {
  return useQuery({
    queryKey: ['top-spenders-raised', visibleIds],
    enabled: visibleIds.length > 0,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data: rollups } = await supabase
        .from('committee_finance_rollups')
        .select('committee_id, local_itemized, fec_total_receipts, fec_itemized')
        .in('committee_id', visibleIds);
      const map = new Map<string, number>();
      (rollups ?? []).forEach((r) => {
        const v = Number(r.local_itemized ?? r.fec_total_receipts ?? r.fec_itemized ?? 0);
        map.set(r.committee_id, (map.get(r.committee_id) ?? 0) + v);
      });
      return map;
    },
  });
};

export interface SpenderCause {
  label: string;
  stance: string | null;
  issue: string | null;
}

export const useTopSpendersCauses = (visibleIds: string[]) => {
  return useQuery({
    queryKey: ['top-spenders-causes', visibleIds],
    enabled: visibleIds.length > 0,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await supabase
        .from('committee_topics')
        .select('fec_committee_id, primary_cause:primary_cause_id(label, stance, issue)')
        .in('fec_committee_id', visibleIds);
      const map = new Map<string, SpenderCause>();
      ((data ?? []) as unknown as Array<{
        fec_committee_id: string;
        primary_cause: { label: string | null; stance: string | null; issue: string | null } | null;
      }>).forEach((r) => {
        if (r.primary_cause?.label) {
          map.set(r.fec_committee_id, {
            label: r.primary_cause.label,
            stance: r.primary_cause.stance ?? null,
            issue: r.primary_cause.issue ?? null,
          });
        }
      });
      return map;
    },
  });
};
