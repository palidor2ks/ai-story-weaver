import { useMemo, useState } from 'react';
import { officeBucket, candidateKey, chooseCandidate } from '@/lib/electionUtils';
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
import { logBadgeEvent } from '@/lib/badges';

interface Props {
  address: string | null | undefined;
}

const PARTY_BADGE: Record<string, string> = {
  Democrat: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  Republican: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
  Independent: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
  Other: 'bg-muted text-muted-foreground border-border',
};

const OFFICE_LABELS: Record<string, string> = {
  president: 'President',
  governor: 'Governor',
  senate: 'Senator',
  house: 'House Representative',
  'state-senate': 'State Senator',
  'state-house': 'State Representative',
  mayor: 'Mayor',
  'local-council': 'Local Council',
};

const OFFICE_ORDER = ['president', 'senate', 'house', 'governor', 'state-senate', 'state-house', 'mayor', 'local-council'];

function officeLabel(office: string): string {
  const bucket = officeBucket(office);
  return OFFICE_LABELS[bucket] ?? office;
}

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

interface RaceGroup {
  key: string;
  label: string;
  election: UpcomingElection;
  candidates: UpcomingCandidate[];
}

interface OfficeGroup {
  key: string;
  label: string;
  races: RaceGroup[];
}

function electionTypeLabel(type: string): string {
  const value = (type || '').replace(/[_-]+/g, ' ').trim();
  if (!value) return 'Election';
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function racePartyLabel(candidates: UpcomingCandidate[]): string | null {
  const parties = Array.from(new Set(candidates.map((candidate) => candidate.party).filter(Boolean)));
  if (parties.length !== 1) return null;
  const [party] = parties;
  return ['Democrat', 'Republican', 'Independent'].includes(party) ? party : null;
}

function raceLabel(election: UpcomingElection, candidates: UpcomingCandidate[]): string {
  const party = racePartyLabel(candidates);
  const type = electionTypeLabel(election.election_type);
  if (party && /primary/i.test(type)) return `${party} Primary`;
  if (party && /runoff/i.test(type)) return `${party} Runoff`;
  return election.name || type;
}

function raceKey(election: UpcomingElection, officeKey: string, candidates: UpcomingCandidate[]): string {
  const parties = Array.from(new Set(candidates.map((candidate) => candidate.party))).sort().join(',');
  return [election.election_date, election.election_type, election.level, election.jurisdiction ?? '', officeKey, parties].join('|').toLowerCase();
}

function buildOfficeGroups(elections: UpcomingElection[]): OfficeGroup[] {
  const officeGroups = new Map<string, OfficeGroup>();

  for (const election of elections) {
    const candidatesByOffice = new Map<string, UpcomingCandidate[]>();

    for (const candidate of election.candidates) {
      const officeKey = officeBucket(candidate.office);
      const officeCandidates = candidatesByOffice.get(officeKey) ?? [];
      const existingIndex = officeCandidates.findIndex((existing) => candidateKey(existing) === candidateKey(candidate));
      if (existingIndex === -1) {
        officeCandidates.push(candidate);
      } else {
        officeCandidates[existingIndex] = chooseCandidate(officeCandidates[existingIndex], candidate);
      }
      candidatesByOffice.set(officeKey, officeCandidates);
    }

    for (const [officeKey, candidates] of candidatesByOffice.entries()) {
      const sortedCandidates = candidates.sort((a, b) => a.name.localeCompare(b.name));
      const officeGroup = officeGroups.get(officeKey) ?? {
        key: officeKey,
        label: officeLabel(sortedCandidates[0]?.office ?? officeKey),
        races: [],
      };
      const key = raceKey(election, officeKey, sortedCandidates);
      const existingRace = officeGroup.races.find((race) => race.key === key);

      if (existingRace) {
        for (const candidate of sortedCandidates) {
          const existingIndex = existingRace.candidates.findIndex((existing) => candidateKey(existing) === candidateKey(candidate));
          if (existingIndex === -1) {
            existingRace.candidates.push(candidate);
          } else {
            existingRace.candidates[existingIndex] = chooseCandidate(existingRace.candidates[existingIndex], candidate);
          }
        }
        existingRace.candidates.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        officeGroup.races.push({
          key,
          label: raceLabel(election, sortedCandidates),
          election,
          candidates: sortedCandidates,
        });
      }

      officeGroups.set(officeKey, officeGroup);
    }
  }

  return Array.from(officeGroups.values())
    .map((group) => ({
      ...group,
      races: group.races.sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => {
      const aIndex = OFFICE_ORDER.indexOf(a.key);
      const bIndex = OFFICE_ORDER.indexOf(b.key);
      if (aIndex !== -1 || bIndex !== -1) return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
      return a.label.localeCompare(b.label);
    });
}

function NextElectionBallot({ elections, onOpen, ieMap }: { elections: UpcomingElection[]; onOpen: (e: UpcomingElection) => void; ieMap?: IETotalsMap }) {
  const sortedElections = useMemo(
    () => [...elections].sort((a, b) => a.election_date.localeCompare(b.election_date)),
    [elections],
  );
  const electionDate = sortedElections[0]?.election_date;
  const officeGroups = useMemo(() => buildOfficeGroups(sortedElections), [sortedElections]);
  const names = Array.from(new Set(sortedElections.map((e) => e.name))).join(' • ');

  return (
    <div className="space-y-4">
      {electionDate ? (
        <div className="flex items-start gap-2 text-sm text-foreground">
          <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
          <div className="min-w-0">
            <div className="font-semibold">{formatDate(electionDate)}</div>
            {names ? <div className="text-muted-foreground">{names}</div> : null}
          </div>
        </div>
      ) : null}

      {officeGroups.map((group) => (
        <section key={group.key} className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{group.label}</h4>
          <div className="space-y-3">
            {group.races.map((race) => (
              <div key={race.key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 pl-1">
                  <div className="text-xs font-medium text-muted-foreground">{race.label}</div>
                  <button
                    type="button"
                    onClick={() => {
                      onOpen(race.election);
                      logBadgeEvent('election_viewed', { election_id: race.election.id, name: race.election.name });
                    }}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Details <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-1.5">
                  {race.candidates.map((candidate) => <CandidateRow key={candidateKey(candidate)} c={candidate} ieMap={ieMap} />)}
                </div>
              </div>
            ))}
          </div>
        </section>
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
            <NextElectionBallot
              elections={[...(data?.federal ?? []), ...(data?.state ?? []), ...(data?.local ?? [])]}
              onOpen={setOpenElection}
              ieMap={ieMap}
            />
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
