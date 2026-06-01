import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, ExternalLink, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ScoreText } from '@/components/ScoreText';
import type { UpcomingElection, UpcomingCandidate } from '@/hooks/useUpcomingElections';
import type { IETotalsMap, IETotals } from '@/hooks/useIndependentExpenditures';
import { IESummaryInline, formatIECompact } from '@/components/IESummaryInline';
import { electionSeatKey, electionSeatLabel } from '@/lib/electionSeatUtils';

const PARTY_BADGE: Record<string, string> = {
  Democrat: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  Republican: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
  Independent: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
  Other: 'bg-muted text-muted-foreground border-border',
};

const TIER_LABEL: Record<string, string> = {
  tier_1: 'Full coverage',
  tier_2: 'Partial coverage',
  tier_3: 'Limited coverage',
};

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function CandidateCard({ c, ie }: { c: UpcomingCandidate; ie?: IETotals }) {
  return (
    <div className="rounded-lg border border-border/60 p-3 space-y-2">
      <div className="flex items-start gap-3">
        {c.image_url ? (
          <img src={c.image_url} alt={c.name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-muted flex-shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{c.name}</span>
            <Badge variant="outline" className={PARTY_BADGE[c.party] ?? PARTY_BADGE.Other}>{c.party}</Badge>
            {c.is_incumbent && <Badge variant="secondary" className="text-xs">Incumbent</Badge>}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {c.office}{c.district ? ` · District ${c.district}` : ''}{c.state ? ` · ${c.state}` : ''}
          </div>
          <IESummaryInline totals={ie} size="sm" className="mt-1" />
        </div>
        <div className="flex-shrink-0 text-right">
          {c.is_pending_research ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground italic">
              <Loader2 className="w-3 h-3 animate-spin" /> Researching…
            </span>
          ) : c.overall_score !== null ? (
            <ScoreText score={c.overall_score} className="text-sm font-semibold" />
          ) : (
            <span className="text-xs text-muted-foreground">No data yet</span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 pl-15">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[10px]">{TIER_LABEL[c.coverage_tier] ?? c.coverage_tier}</Badge>
          {c.confidence && (
            <Badge variant="outline" className="text-[10px] capitalize">{c.confidence} confidence</Badge>
          )}
        </div>
        <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
          <Link to={`/candidate/${c.candidate_id}`}>
            View profile <ExternalLink className="w-3 h-3 ml-1" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

interface Props {
  election: UpcomingElection | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ieMap?: IETotalsMap;
}

export function ElectionDetailsDialog({ election, open, onOpenChange, ieMap }: Props) {
  if (!election) return null;

  const byOffice = new Map<string, { label: string; candidates: UpcomingCandidate[] }>();
  for (const c of election.candidates) {
    const key = electionSeatKey(c, election);
    const existing = byOffice.get(key);
    if (existing) {
      existing.candidates.push(c);
    } else {
      byOffice.set(key, { label: electionSeatLabel(c, election), candidates: [c] });
    }
  }

  // Total outside spending across all candidates in this race
  let raceSupport = 0;
  let raceOppose = 0;
  for (const c of election.candidates) {
    const ie = ieMap?.get(c.candidate_id);
    raceSupport += ie?.support_amount ?? 0;
    raceOppose += ie?.oppose_amount ?? 0;
  }
  const raceTotal = raceSupport + raceOppose;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{election.name}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-3 text-xs pt-1">
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> {formatDate(election.election_date)}
            </span>
            <Badge variant="outline" className="capitalize">{election.level}</Badge>
            <Badge variant="outline" className="capitalize">{election.election_type}</Badge>
            {(election.jurisdiction || election.state) && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> {election.jurisdiction ?? election.state}
              </span>
            )}
            <span className="text-muted-foreground">Source: {election.source}</span>
          </DialogDescription>
        </DialogHeader>

        {raceTotal > 0 && (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-medium">Outside money in this race:</span>
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="w-3 h-3" /> {formatIECompact(raceSupport)} supporting
            </span>
            <span className="inline-flex items-center gap-1 text-destructive">
              <TrendingDown className="w-3 h-3" /> {formatIECompact(raceOppose)} opposing
            </span>
          </div>
        )}

        <div className="space-y-5 pt-2">
          {byOffice.size === 0 ? (
            <p className="text-sm text-muted-foreground">No candidates listed yet for this race.</p>
          ) : (
            Array.from(byOffice.entries()).map(([key, group]) => (
              <section key={key} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label} · {group.candidates.length} candidate{group.candidates.length === 1 ? '' : 's'}
                </h3>
                <div className="space-y-2">
                  {group.candidates.map(c => <CandidateCard key={c.candidate_id} c={c} ie={ieMap?.get(c.candidate_id)} />)}
                </div>
              </section>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
