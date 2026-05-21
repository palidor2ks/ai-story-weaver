import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Vote, Calendar, MapPin, ChevronRight, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUpcomingElections, type UpcomingCandidate, type UpcomingElection } from '@/hooks/useUpcomingElections';
import { ScoreText } from '@/components/ScoreText';
import { ElectionDetailsDialog } from './ElectionDetailsDialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useCandidatesIE, type IETotalsMap } from '@/hooks/useIndependentExpenditures';
import { IESummaryInline } from '@/components/IESummaryInline';

interface Props {
  address: string | null | undefined;
}

const PARTY_BADGE: Record<string, string> = {
  Democrat: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  Republican: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
  Independent: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
  Other: 'bg-muted text-muted-foreground border-border',
};

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function CandidateRow({ c, ieMap }: { c: UpcomingCandidate; ieMap?: IETotalsMap }) {
  const ie = ieMap?.get(c.candidate_id);
  return (
    <Link
      to={`/candidate/${c.candidate_id}`}
      className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 hover:bg-accent/40 transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {c.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.image_url} alt={c.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-muted flex-shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{c.name}</span>
            <Badge variant="outline" className={PARTY_BADGE[c.party] ?? PARTY_BADGE.Other}>
              {c.party}
            </Badge>
            {c.is_incumbent && (
              <Badge variant="secondary" className="text-xs">Incumbent</Badge>
            )}
          </div>
          <IESummaryInline totals={ie} className="mt-0.5" />
        </div>
      </div>
      <div className="flex-shrink-0 text-right">
        {c.is_pending_research ? (
          <span className="text-xs text-muted-foreground italic">Researching…</span>
        ) : c.overall_score !== null ? (
          <ScoreText score={c.overall_score} className="text-sm font-semibold" />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
    </Link>
  );
}

function ElectionGroup({ election, onOpen, ieMap }: { election: UpcomingElection; onOpen: (e: UpcomingElection) => void; ieMap?: IETotalsMap }) {
  // Group candidates by office within this election.
  const byOffice = new Map<string, UpcomingCandidate[]>();
  for (const c of election.candidates) {
    if (!byOffice.has(c.office)) byOffice.set(c.office, []);
    byOffice.get(c.office)!.push(c);
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => onOpen(election)}
        className="w-full flex items-center gap-2 text-sm font-semibold text-foreground text-left rounded-md px-2 py-1 -mx-2 hover:bg-accent/40 transition-colors group"
      >
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <span>{formatDate(election.election_date)}</span>
        <span className="text-muted-foreground font-normal">— {election.name}</span>
        <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto group-hover:translate-x-0.5 transition-transform" />
      </button>
      {Array.from(byOffice.entries()).map(([office, cands]) => (
        <div key={office} className="space-y-1.5 pl-6">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{office}</div>
          <div className="space-y-1.5">
            {cands.map(c => <CandidateRow key={c.candidate_id} c={c} ieMap={ieMap} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function UpcomingElectionsCard({ address }: Props) {
  const { data, isLoading, refresh, isRefreshing } = useUpcomingElections(address);
  const [openElection, setOpenElection] = useState<UpcomingElection | null>(null);

  const total =
    (data?.federal.length ?? 0) +
    (data?.state.length ?? 0) +
    (data?.local.length ?? 0);

  const allCandidateIds = useMemo(() => {
    const ids = new Set<string>();
    [...(data?.federal ?? []), ...(data?.state ?? []), ...(data?.local ?? [])].forEach((e) => {
      e.candidates.forEach((c) => ids.add(c.candidate_id));
    });
    return Array.from(ids);
  }, [data]);
  const { data: ieMap } = useCandidatesIE(allCandidateIds);

  const handleRefresh = async () => {
    const result = await refresh();
    if (result.ok) {
      toast.success('Elections refreshed');
    } else {
      toast.error(result.error ?? 'Failed to refresh elections');
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Vote className="w-5 h-5" />
              Upcoming Elections on Your Ballot
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={!address || isRefreshing || isLoading}
              className="h-8 gap-1.5"
              title="Re-fetch from FEC and Google Civic"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="text-xs">Refresh</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!address ? (
            <p className="text-muted-foreground text-sm">Add your address to see upcoming elections.</p>
          ) : isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : total === 0 ? (
            <p className="text-muted-foreground text-sm">
              No upcoming elections found for your address yet. Check back closer to election day.
            </p>
          ) : (
            <div className="space-y-6">
              {data?.federal.length ? (
                <section className="space-y-4">
                  <h4 className="text-sm font-semibold text-muted-foreground">Federal</h4>
                  {data.federal.map(e => <ElectionGroup key={e.id} election={e} onOpen={setOpenElection} />)}
                </section>
              ) : null}
              {data?.state.length ? (
                <section className="space-y-4">
                  <h4 className="text-sm font-semibold text-muted-foreground">State</h4>
                  {data.state.map(e => <ElectionGroup key={e.id} election={e} onOpen={setOpenElection} />)}
                </section>
              ) : null}
              {data?.local.length ? (
                <section className="space-y-4">
                  <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> Local
                  </h4>
                  {data.local.map(e => <ElectionGroup key={e.id} election={e} onOpen={setOpenElection} />)}
                </section>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Local race coverage is limited — typically only available in the weeks leading up to an election.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <ElectionDetailsDialog
        election={openElection}
        open={!!openElection}
        onOpenChange={(o) => { if (!o) setOpenElection(null); }}
      />
    </>
  );
}
