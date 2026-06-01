import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Vote, Calendar, ChevronRight, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUpcomingElections, type UpcomingCandidate, type UpcomingElection } from '@/hooks/useUpcomingElections';
import { ScoreText } from '@/components/ScoreText';
import { ElectionDetailsDialog } from './ElectionDetailsDialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useCandidatesIE, type IETotalsMap } from '@/hooks/useIndependentExpenditures';
import { IESummaryInline } from '@/components/IESummaryInline';
import { canonicalElectionSeat, electionSeatKey, electionSeatLabel } from '@/lib/electionSeatUtils';

interface Props {
  address: string | null | undefined;
}

const PARTY_BADGE: Record<string, string> = {
  Democrat: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  Republican: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
  Independent: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
  Other: 'bg-muted text-muted-foreground border-border',
};

type Phase = 'primary' | 'general' | 'other';

const PHASE_META: Record<Phase, { label: string; description: string }> = {
  primary: { label: 'Primary', description: 'Party nominees compete for the ballot line.' },
  general: { label: 'General', description: 'The final election that decides the seat.' },
  other: { label: 'Special & Runoff', description: 'Off-cycle, special, or runoff contests.' },
};

function classifyPhase(electionType: string): Phase {
  const t = electionType.toLowerCase();
  if (t.includes('primary')) return 'primary';
  if (t.includes('general')) return 'general';
  return 'other';
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

interface SeatGroup {
  key: string;
  office: string;
  state: string | null;
  district: string | null;
  jurisdiction: string | null;
  candidates: UpcomingCandidate[];
  elections: UpcomingElection[]; // every election feeding this seat (for date display + dialog)
}


function normalizeCandidateText(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function candidateSignature(candidate: UpcomingCandidate): string {
  return [
    normalizeCandidateText(candidate.name),
    normalizeCandidateText(candidate.party),
    normalizeCandidateText(candidate.office),
    normalizeCandidateText(candidate.state),
    normalizeCandidateText(candidate.district),
  ].join('|');
}

function mergeSeatCandidate(existing: UpcomingCandidate, incoming: UpcomingCandidate): UpcomingCandidate {
  return {
    ...existing,
    ...incoming,
    candidate_id: existing.candidate_id || incoming.candidate_id,
    image_url: existing.image_url ?? incoming.image_url,
    overall_score: existing.overall_score ?? incoming.overall_score,
    confidence: existing.confidence ?? incoming.confidence,
    answers_source: existing.answers_source ?? incoming.answers_source,
    source_url: existing.source_url ?? incoming.source_url,
    is_incumbent: existing.is_incumbent || incoming.is_incumbent,
    is_pending_research: existing.is_pending_research && incoming.is_pending_research,
    office: incoming.office.length > existing.office.length ? incoming.office : existing.office,
    district: existing.district ?? incoming.district,
  };
}

function addSeatCandidate(seat: SeatGroup, candidate: UpcomingCandidate) {
  const byIdIndex = seat.candidates.findIndex(x => x.candidate_id === candidate.candidate_id);
  const bySignatureIndex = seat.candidates.findIndex(x => candidateSignature(x) === candidateSignature(candidate));
  const index = byIdIndex >= 0 ? byIdIndex : bySignatureIndex;

  if (index === -1) {
    seat.candidates.push(candidate);
  } else {
    seat.candidates[index] = mergeSeatCandidate(seat.candidates[index], candidate);
  }
}

function buildSeatGroups(elections: UpcomingElection[]): SeatGroup[] {
  const seats = new Map<string, SeatGroup>();
  for (const e of elections) {
    for (const c of e.candidates) {
      const key = electionSeatKey(c, e);
      let seat = seats.get(key);
      if (!seat) {
        const canonicalSeat = canonicalElectionSeat(c, e);
        seat = {
          key,
          office: canonicalSeat.office,
          state: canonicalSeat.state,
          district: canonicalSeat.district,
          jurisdiction: canonicalSeat.jurisdiction,
          candidates: [],
          elections: [],
        };
        seats.set(key, seat);
      }
      addSeatCandidate(seat, c);
      if (!seat.elections.some(x => x.id === e.id)) seat.elections.push(e);
    }
  }
  // Sort: each seat's earliest election date ascending
  const earliest = (s: SeatGroup) =>
    Math.min(...s.elections.map(e => new Date(`${e.election_date}T00:00:00`).getTime()));
  return Array.from(seats.values()).sort((a, b) => earliest(a) - earliest(b));
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
            {c.source === 'ai_research' && (
              c.source_url ? (
                <a
                  href={c.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title={`AI-discovered candidate — source: ${c.source_url}`}
                  className="inline-flex"
                >
                  <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30">
                    AI-sourced
                  </Badge>
                </a>
              ) : (
                <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" title="AI-discovered candidate">
                  AI-sourced
                </Badge>
              )
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

function SeatBlock({
  seat,
  onOpen,
  ieMap,
}: {
  seat: SeatGroup;
  onOpen: (e: UpcomingElection) => void;
  ieMap?: IETotalsMap;
}) {
  // Pick the soonest election for the seat header / dialog target.
  const primaryElection = [...seat.elections].sort(
    (a, b) =>
      new Date(`${a.election_date}T00:00:00`).getTime() -
      new Date(`${b.election_date}T00:00:00`).getTime(),
  )[0];

  const dates = seat.elections
    .map(e => formatDate(e.election_date))
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(' · ');

  const dialogElection: UpcomingElection = {
    ...primaryElection,
    name: electionSeatLabel(seat.candidates[0], primaryElection),
    state: seat.state ?? primaryElection.state,
    jurisdiction: seat.jurisdiction ?? primaryElection.jurisdiction,
    candidates: seat.candidates,
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => onOpen(dialogElection)}
        className="w-full flex items-center gap-2 text-left rounded-md px-2 py-1 -mx-2 hover:bg-accent/40 transition-colors group"
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground truncate">{electionSeatLabel(seat.candidates[0], primaryElection)}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <Calendar className="w-3 h-3" />
            <span>{dates}</span>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
      </button>
      <div className="space-y-1.5 pl-2">
        {seat.candidates.map(c => (
          <CandidateRow key={c.candidate_id} c={c} ieMap={ieMap} />
        ))}
      </div>
    </div>
  );
}

function PhaseSection({
  phase,
  seats,
  onOpen,
  ieMap,
}: {
  phase: Phase;
  seats: SeatGroup[];
  onOpen: (e: UpcomingElection) => void;
  ieMap?: IETotalsMap;
}) {
  if (seats.length === 0) return null;
  const meta = PHASE_META[phase];
  return (
    <section className="space-y-4">
      <div className="space-y-0.5">
        <h4 className="text-sm font-semibold text-foreground">{meta.label}</h4>
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      </div>
      <div className="space-y-5">
        {seats.map(seat => (
          <SeatBlock key={seat.key} seat={seat} onOpen={onOpen} ieMap={ieMap} />
        ))}
      </div>
    </section>
  );
}

export function UpcomingElectionsCard({ address }: Props) {
  const { data, isLoading, refresh, isRefreshing } = useUpcomingElections(address);
  const [openElection, setOpenElection] = useState<UpcomingElection | null>(null);

  const allElections = useMemo(
    () => [...(data?.federal ?? []), ...(data?.state ?? []), ...(data?.local ?? [])],
    [data],
  );

  const byPhase = useMemo(() => {
    const buckets: Record<Phase, UpcomingElection[]> = { primary: [], general: [], other: [] };
    for (const e of allElections) buckets[classifyPhase(e.election_type)].push(e);
    return {
      primary: buildSeatGroups(buckets.primary),
      general: buildSeatGroups(buckets.general),
      other: buildSeatGroups(buckets.other),
    };
  }, [allElections]);

  const total = byPhase.primary.length + byPhase.general.length + byPhase.other.length;

  const allCandidateIds = useMemo(() => {
    const ids = new Set<string>();
    allElections.forEach(e => e.candidates.forEach(c => ids.add(c.candidate_id)));
    return Array.from(ids);
  }, [allElections]);
  const { data: ieMap } = useCandidatesIE(allCandidateIds);

  const handleRefresh = async () => {
    const result = await refresh();
    if (result.ok) toast.success('Elections refreshed');
    else toast.error(result.error ?? 'Failed to refresh elections');
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Vote className="w-5 h-5" />
                Candidates on Your Upcoming Ballot
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Grouped by election phase, then by seat. Primary races decide each party's nominee; the general election picks the winner.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={!address || isRefreshing || isLoading}
              className="h-8 gap-1.5"
              title="Re-fetch from FEC, Google Civic, and AI election research"
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
              No upcoming ballot candidates found for your address yet. Check back closer to election day or tap Refresh to re-check FEC, Google Civic, and AI election research sources.
            </p>
          ) : (
            <div className="space-y-8">
              <PhaseSection phase="primary" seats={byPhase.primary} onOpen={setOpenElection} ieMap={ieMap} />
              <PhaseSection phase="general" seats={byPhase.general} onOpen={setOpenElection} ieMap={ieMap} />
              <PhaseSection phase="other" seats={byPhase.other} onOpen={setOpenElection} ieMap={ieMap} />
            </div>
          )}
        </CardContent>
      </Card>
      <ElectionDetailsDialog
        election={openElection}
        open={!!openElection}
        onOpenChange={(o) => { if (!o) setOpenElection(null); }}
        ieMap={ieMap}
      />
    </>
  );
}
