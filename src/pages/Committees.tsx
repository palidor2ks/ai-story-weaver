import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/Header';
import { Seo } from '@/components/Seo';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCommitteesPaginated, useCommitteeFilterOptions } from '@/hooks/useCommittees';
import { Loader2, Landmark, Users, DollarSign, ArrowRight, Search, SlidersHorizontal, Inbox, Megaphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { CommitteesViewSwitcher } from '@/components/CommitteesViewSwitcher';
import { formatIECompact } from '@/components/IESummaryInline';


const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

const formatNumber = (value: number) =>
  value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(1)}M`
    : value >= 1_000
      ? `${(value / 1_000).toFixed(0)}K`
      : value.toLocaleString();

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? '—'
    : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const Committees = () => {
  const [search, setSearch] = useState('');
  const [cycle, setCycle] = useState<string>('all');
  const [designation, setDesignation] = useState<string>('all');
  const [candidateId, setCandidateId] = useState<string>('all');
  const [hideUnsynced, setHideUnsynced] = useState(true);

  const { data: filterOptions, isLoading: filtersLoading } = useCommitteeFilterOptions();

  const availableCycles = useMemo(
    () => {
      const cycles = filterOptions?.cycles ?? [];
      // Always keep "all" so the page is usable even when the RPC returns no cycles
      return Array.from(new Set(['all', ...cycles]));
    },
    [filterOptions],
  );

  const hasCycleData = availableCycles.length > 1;
  const hasAnyFilterOptions =
    hasCycleData
    || (filterOptions?.designations?.length ?? 0) > 0
    || (filterOptions?.candidates?.length ?? 0) > 0;

  const availableDesignations = useMemo(
    () => filterOptions?.designations ?? [],
    [filterOptions],
  );

  const candidateOptions = useMemo(
    () => filterOptions?.candidates ?? [],
    [filterOptions],
  );

  useEffect(() => {
    if (availableCycles.length > 0 && !availableCycles.includes(cycle)) {
      setCycle(availableCycles[0]);
    }
  }, [availableCycles, cycle]);

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useCommitteesPaginated({
    search,
    cycle,
    designation,
    candidateId,
    pageSize: 50,
  });

  const committees = useMemo(
    () => {
      const all = (data?.pages.flatMap((page) => page.committees) ?? [])
        .slice()
        .sort((a, b) => b.totalRaised - a.totalRaised);
      if (!hideUnsynced) return all;
      return all.filter((c) => c.lastSyncDate || c.totalRaised > 0);
    },
    [data, hideUnsynced],
  );

  // Batched lookup: outside-spending totals for the visible committees
  const visibleIds = useMemo(
    () => committees.map((c) => c.fecCommitteeId).filter(Boolean).slice(0, 200),
    [committees],
  );
  const { data: ieMap } = useQuery({
    queryKey: ['committees-ie-totals', visibleIds],
    enabled: visibleIds.length > 0,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('committee_independent_expenditure_totals')
        .select('spending_committee_fec_id, total_amount')
        .in('spending_committee_fec_id', visibleIds);
      const map = new Map<string, number>();
      (rows ?? []).forEach((r) => {
        if (r.spending_committee_fec_id) map.set(r.spending_committee_fec_id, Number(r.total_amount ?? 0));
      });
      return map;
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Top Federal Committees by Receipts — Pulse"
        description="All federal committees ranked by money raised. Donor counts, contribution totals, and links to the candidates they back."
        path="/committees"
      />

      <Header />

      <main className="container py-8 px-4">
        <div className="flex flex-col gap-4 mb-8">
          <div>
            <p className="text-sm text-muted-foreground mb-1 font-medium">Committees</p>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">Top Federal Committees by Receipts</h1>
            <p className="text-muted-foreground mt-2">
              All federal committees ranked by money raised. Looking for outside spending instead? See{' '}
              <Link to="/top-spenders" className="text-primary underline-offset-2 hover:underline">Top Outside Spenders</Link>.
            </p>
            <div className="mt-3">
              <CommitteesViewSwitcher />
            </div>
          </div>


          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative w-full sm:max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by committee name, FEC ID, or candidate"
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={cycle}
                onValueChange={setCycle}
                disabled={isLoading || filtersLoading || !hasCycleData}
              >
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder={hasCycleData ? 'Cycle' : 'All cycles'} />
                </SelectTrigger>
                <SelectContent>
                  {availableCycles.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c === 'all' ? 'All cycles' : c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={designation} onValueChange={setDesignation} disabled={isLoading || filtersLoading}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Designation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All designations</SelectItem>
                  {availableDesignations.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={candidateId} onValueChange={setCandidateId} disabled={isLoading || filtersLoading}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Filter by candidate" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="all">All candidates</SelectItem>
                  {candidateOptions.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.name} ({candidate.party})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant={hideUnsynced ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setHideUnsynced((v) => !v)}
                disabled={isLoading}
                className="h-10"
              >
                {hideUnsynced ? 'Hide unsynced' : 'Show all'}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setSearch('');
                  setCycle(availableCycles[0] || 'all');
                  setDesignation('all');
                  setCandidateId('all');
                  setHideUnsynced(true);
                }}
                disabled={isLoading}
              >
                <SlidersHorizontal className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {isError && error && (
          <div className="text-center py-16 text-destructive">
            Unable to load committees: {error.message}
          </div>
        )}

        {!isLoading && !isError && committees.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center text-center py-16 px-6 gap-3">
              <div className="w-12 h-12 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
                <Inbox className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-lg">No committees to show</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                {!hasAnyFilterOptions
                  ? "We don't have any committee data loaded yet. Once committees are imported, they'll appear here."
                  : 'No committees match your current filters. Try clearing the search or selecting a different cycle.'}
              </p>
              {hasAnyFilterOptions && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setCycle('all');
                    setDesignation('all');
                    setCandidateId('all');
                  }}
                >
                  Clear filters
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {committees.map((committee) => (
            <Card
              key={committee.id}
              className="hover:border-primary/50 transition-colors group"
            >
              <CardContent className="p-5 h-full">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <Landmark className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-lg leading-tight">
                          {committee.aliasName || committee.name || 'Unknown Committee'}
                        </h3>
                        {committee.designation && (
                          <Badge variant="secondary" className="text-xs">
                            {committee.designation}
                          </Badge>
                        )}
                        {committee.role && (
                          <Badge variant="outline" className="text-xs">
                            {committee.role}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">FEC ID: {committee.fecCommitteeId}</p>
                      {committee.candidate && (
                        <p className="text-sm text-muted-foreground">
                          Linked to {committee.candidate.name} ({committee.candidate.party})
                        </p>
                      )}
                    </div>
                  </div>
                  <Link to={`/committee/${committee.fecCommitteeId}`}>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>

                {(() => {
                  const isUnsynced = !committee.lastSyncDate && committee.totalRaised === 0;
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-3 mt-6">
                        <div className="p-3 rounded-lg border bg-muted/30">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <DollarSign className="w-4 h-4" />
                            Total Raised
                          </div>
                          <p className={cn(
                            "text-xl font-semibold mt-1",
                            isUnsynced ? "text-muted-foreground" : "text-foreground"
                          )}>
                            {isUnsynced ? '—' : formatCurrency(committee.totalRaised)}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg border bg-muted/30">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Users className="w-4 h-4" />
                            Donors
                          </div>
                          <p className={cn(
                            "text-xl font-semibold mt-1",
                            committee.donorCount > 0 ? "text-foreground" : "text-muted-foreground"
                          )}>
                            {isUnsynced ? '—' : formatNumber(committee.donorCount)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground mt-4">
                        <span>
                          {isUnsynced
                            ? 'Not yet synced from FEC'
                            : `Contributions: ${formatNumber(committee.contributionCount)}`}
                        </span>
                        <span>Last sync: {formatDate(committee.lastSyncDate)}</span>
                      </div>
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          ))}
        </div>

        {hasNextPage && (
          <div className="flex justify-center mt-10">
            <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </div>
              ) : (
                'Load more committees'
              )}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};
