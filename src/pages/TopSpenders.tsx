import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { Seo } from '@/components/Seo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Megaphone, TrendingUp, TrendingDown, Search, ExternalLink, EyeOff, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatIECompact } from '@/components/IESummaryInline';
import { CommitteesViewSwitcher } from '@/components/CommitteesViewSwitcher';
import { useAdminRole } from '@/hooks/useAdminRole';
import { useExcludeCommittee, useIEExclusions } from '@/hooks/useIEExclusions';
import { toast } from 'sonner';


type Stance = 'all' | 'support' | 'oppose';

interface SpenderRow {
  spending_committee_fec_id: string;
  spending_committee_name: string | null;
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
  const { data } = await supabase
    .from('external_pacs')
    .select('fec_committee_id, name')
    .in('fec_committee_id', unique);
  (data ?? []).forEach((r: { fec_committee_id: string; name: string | null }) => {
    if (r.name) map.set(r.fec_committee_id, r.name);
  });
  return map;
}

const useTopSpenders = (cycle: string | 'all', stance: Stance, excludedIds: string[]) => {
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
        if (!current || better.length > current.length + 2) {
          return { ...r, spending_committee_name: better };
        }
        return r;
      });
    },
  });
};


const useIECycles = () => {
  return useQuery({
    queryKey: ['ie-cycles'],
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('independent_expenditure_cycles')
        .select('cycle');
      if (error) throw error;
      const set = new Set<string>();
      (data ?? []).forEach((r: { cycle: string | null }) => r.cycle && set.add(r.cycle));
      return Array.from(set).sort((a, b) => b.localeCompare(a));
    },
  });
};

export default function TopSpenders() {
  const { data: cycles } = useIECycles();
  const { data: exclusions } = useIEExclusions();
  const excludedIds = useMemo(
    () => (exclusions ?? []).map((e) => e.fec_committee_id),
    [exclusions],
  );
  const [cycle, setCycle] = useState<string | 'all'>('all');
  const [stance, setStance] = useState<Stance>('all');
  const [search, setSearch] = useState('');

  const { data: rows, isLoading } = useTopSpenders(cycle, stance, excludedIds);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows ?? [];
    return (rows ?? []).filter((r) =>
      (r.spending_committee_name ?? '').toLowerCase().includes(q) ||
      r.spending_committee_fec_id.toLowerCase().includes(q),
    );
  }, [rows, search]);

  // Batched lookup: receipts (raised) for visible spender rows from committee_finance_rollups
  const visibleIds = useMemo(
    () => filtered.map((r) => r.spending_committee_fec_id).filter(Boolean).slice(0, 100),
    [filtered],
  );
  const { data: raisedMap } = useQuery({
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

  const { data: causeMap } = useQuery({
    queryKey: ['top-spenders-causes', visibleIds],
    enabled: visibleIds.length > 0,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('committee_topics')
        .select('fec_committee_id, primary_cause:primary_cause_id(label, stance, issue)')
        .in('fec_committee_id', visibleIds);
      const map = new Map<string, { label: string; stance: string | null; issue: string | null }>();
      (data ?? []).forEach((r: any) => {
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

  const summary = useMemo(() => {
    const list = rows ?? [];
    return {
      total: list.reduce((s, r) => s + r.total_amount, 0),
      count: list.length,
      top: list[0],
    };
  }, [rows]);


  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Top Outside Spenders by Independent Expenditures — Pulse"
        description="Super PACs and outside groups ranked by independent expenditures supporting or opposing federal candidates."
        path="/top-spenders"
      />

      <Header />
      <main className="container py-8 px-4">
        <div className="mb-6">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2 flex items-center gap-2">
            <Megaphone className="w-7 h-7 text-primary" />
            Top Outside Spenders
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            Super PACs and outside groups ranked by independent expenditures supporting or opposing federal candidates. These dollars are
            spent <em>independently</em> of campaigns and are not subject to contribution limits. Looking for fundraising totals?
            See <Link to="/committees" className="text-primary underline-offset-2 hover:underline">Committees by receipts</Link>.
          </p>
          <div className="mt-3">
            <CommitteesViewSwitcher />
          </div>
        </div>


        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-3 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase text-muted-foreground tracking-wide">Total IE spending</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-7 w-32" /> : (
                <p className="text-2xl font-bold">{formatIECompact(summary.total)}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Top {summary.count} {cycle === 'all' ? 'committees, all cycles' : `committees · cycle ${cycle}`}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase text-muted-foreground tracking-wide">Committees</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-7 w-16" /> : (
                <p className="text-2xl font-bold">{summary.count.toLocaleString()}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">Active spenders in view</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase text-muted-foreground tracking-wide">#1 Spender</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-7 w-40" /> : summary.top ? (
                <>
                  <p className="font-semibold truncate">{summary.top.spending_committee_name ?? summary.top.spending_committee_fec_id}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatIECompact(summary.top.total_amount)} spent</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No data</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search committee name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={cycle} onValueChange={(v) => setCycle(v as string | 'all')}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Cycle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All cycles</SelectItem>
              {(cycles ?? []).map((c) => (
                <SelectItem key={c} value={c}>Cycle {c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tabs value={stance} onValueChange={(v) => setStance(v as Stance)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="support">Support</TabsTrigger>
              <TabsTrigger value="oppose">Oppose</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No spenders match the current filters.</p>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((r, i) => (
                  <SpenderRowItem key={r.spending_committee_fec_id} row={r} index={i} raisedMap={raisedMap} causeMap={causeMap} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 flex justify-center">
          <Button variant="ghost" size="sm" asChild>
            <a href="https://www.fec.gov/data/independent-expenditures/" target="_blank" rel="noopener noreferrer" className="gap-1">
              Source: FEC <ExternalLink className="w-3 h-3" />
            </a>
          </Button>
        </div>
      </main>
    </div>
  );
}

interface SpenderRowItemProps {
  row: SpenderRow;
  index: number;
  raisedMap?: Map<string, number>;
  causeMap?: Map<string, { label: string; stance: string | null; issue: string | null }>;
}

function SpenderRowItem({ row: r, index: i, raisedMap, causeMap }: SpenderRowItemProps) {
  const { data: adminData } = useAdminRole();
  const isAdmin = adminData?.isAdmin ?? false;
  const exclude = useExcludeCommittee();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  const handleExclude = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error('Reason is required');
      return;
    }
    try {
      await exclude.mutateAsync({ fecCommitteeId: r.spending_committee_fec_id, reason: trimmed });
      toast.success(`${r.spending_committee_name ?? r.spending_committee_fec_id} excluded from IE rollups`);
      setOpen(false);
      setReason('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to exclude');
    }
  };

  return (
    <div className="relative group">
      <Link
        to={`/committee/${r.spending_committee_fec_id}`}
        state={{ from: '/top-spenders' }}
        className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors"
      >
        <span className="w-8 text-right text-sm font-mono text-muted-foreground">{i + 1}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="font-medium truncate">{r.spending_committee_name ?? r.spending_committee_fec_id}</p>
            {(() => {
              const cause = causeMap?.get(r.spending_committee_fec_id);
              if (!cause) return null;
              const stance = (cause.stance ?? '').toLowerCase();
              const cls =
                stance === 'pro'
                  ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : stance === 'anti'
                    ? 'border-rose-500/60 bg-rose-500/15 text-rose-700 dark:text-rose-300'
                    : 'border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-300';
              return (
                <Badge
                  variant="outline"
                  className={`shrink-0 text-xs font-semibold px-2 py-0.5 max-w-[220px] truncate uppercase tracking-wide ${cls}`}
                  title={cause.issue ?? cause.label}
                >
                  {cause.label}
                </Badge>
              );
            })()}
          </div>
          <p className="text-[11px] text-muted-foreground font-mono truncate">
            {r.spending_committee_fec_id} · {r.expenditure_count.toLocaleString()} expenditure{r.expenditure_count === 1 ? '' : 's'}
            {(() => {
              const raised = raisedMap?.get(r.spending_committee_fec_id) ?? 0;
              return raised > 0 ? (
                <span className="ml-2 text-muted-foreground">· Raised {formatIECompact(raised)}</span>
              ) : null;
            })()}
          </p>
        </div>

        <span className="hidden sm:inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
          <TrendingUp className="w-3 h-3" />{formatIECompact(r.support_amount)}
        </span>
        <span className="hidden sm:inline-flex items-center gap-1 text-destructive text-xs font-medium">
          <TrendingDown className="w-3 h-3" />{formatIECompact(r.oppose_amount)}
        </span>
        <span className={`font-semibold text-right tabular-nums ${isAdmin ? 'pr-10' : ''}`}>{formatIECompact(r.total_amount)}</span>
      </Link>

      {isAdmin && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(true);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Exclude from IE rollups (admin)"
            aria-label="Exclude committee from IE rollups"
          >
            <EyeOff className="w-4 h-4" />
          </button>
          <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Exclude {r.spending_committee_name ?? r.spending_committee_fec_id}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This hides the committee's independent expenditures from every rollup and public list across the platform. The action is reversible from Admin → IE Exclusions.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2">
                <label className="text-sm font-medium">Reason (required)</label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Junk filing — $9.98B amount is bogus"
                  rows={3}
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={exclude.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => { e.preventDefault(); handleExclude(); }}
                  disabled={exclude.isPending || !reason.trim()}
                >
                  {exclude.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Exclude
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
