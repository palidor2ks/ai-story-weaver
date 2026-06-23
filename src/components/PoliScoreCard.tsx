import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePoliScoreRecord, topicDisplayName, type PoliScoreRow } from '@/hooks/usePoliScoreRecord';

type Jurisdiction = 'federal' | 'nc_state';

interface PoliScoreCardProps {
  candidateId: string;
  candidateName: string;
  jurisdiction?: Jurisdiction;
}

const VOTE_LABEL: Record<string, string> = {
  Yea: 'Yea',
  Nay: 'Nay',
  'Not Voting': 'Not Voting',
  Present: 'Present',
};

function VoteBadge({ position }: { position: string | null }) {
  if (!position) return <span className="text-xs text-muted-foreground">—</span>;
  const label = VOTE_LABEL[position] ?? position;
  const cls =
    position === 'Yea'
      ? 'bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-400'
      : position === 'Nay'
      ? 'bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400'
      : 'bg-muted text-muted-foreground';
  return (
    <Badge variant="outline" className={cn('text-xs font-medium whitespace-nowrap', cls)}>
      {label}
    </Badge>
  );
}

function BillReference({ vote, jurisdiction }: { vote: PoliScoreRow; jurisdiction: Jurisdiction }) {
  if (jurisdiction === 'nc_state' && vote.bill_id) {
    // e.g. "nc-2025-SB1080" → "SB 1080 (NC 2025 Session)"
    const shortId = vote.bill_id.replace(/^nc-\d+-/, '').replace(/([A-Za-z]+)(\d+)/, '$1 $2');
    return (
      <p className="text-xs text-muted-foreground">
        {shortId} (NC {vote.session ?? '2025'} Session) —{' '}
        <span className="italic">{vote.title}</span>
      </p>
    );
  }
  if (vote.congress && vote.bill_type && vote.bill_number) {
    return (
      <p className="text-xs text-muted-foreground">
        {vote.bill_type.toUpperCase()}
        {vote.bill_number} ({vote.congress}th Congress) —{' '}
        <span className="italic">{vote.title}</span>
      </p>
    );
  }
  return null;
}

function SourceLink({ vote, jurisdiction }: { vote: PoliScoreRow; jurisdiction: Jurisdiction }) {
  const label = jurisdiction === 'nc_state' ? 'View on NCGA' : 'View on Congress.gov';
  return (
    <a
      href={vote.source_url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      aria-label={label}
    >
      {label}
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}

export function PoliScoreCard({
  candidateId,
  candidateName,
  jurisdiction = 'federal',
}: PoliScoreCardProps) {
  const { data: topics = [], isLoading, error } = usePoliScoreRecord(candidateId, jurisdiction);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-muted-foreground" />
            PoliScore — Voting Record
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
            Loading record…
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-muted-foreground" />
            PoliScore — Voting Record
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Could not load PoliScore record.</p>
        </CardContent>
      </Card>
    );
  }

  const isEmpty = topics.length === 0;

  const emptyText =
    jurisdiction === 'nc_state'
      ? `NC PoliScore coverage is being built out — key votes will appear here as they are curated.`
      : `Not yet scored — v0 covers House votes only. ${candidateName}'s record will appear here when Senate key votes are added.`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          PoliScore — Voting Record
        </CardTitle>

        <p className="text-xs text-muted-foreground leading-relaxed mt-1">
          This score is free and can never be bought. It is computed only from public roll-call
          votes, each linked to its source.
        </p>

        <p className="text-xs text-muted-foreground/80 italic mt-1">
          Left/Right describes the policy direction of a vote on a disclosed axis, not a
          judgment of which direction is correct.
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {isEmpty ? (
          <p className="text-sm text-muted-foreground py-2">{emptyText}</p>
        ) : (
          topics.map((topic) => (
            <div key={topic.topic_id}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm text-foreground">
                  {topicDisplayName(topic.topic_id)}
                </h3>
                <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                  {topic.cast} of {topic.onRecord} key votes cast
                </span>
              </div>

              <div className="space-y-3">
                {topic.votes.map((vote) => (
                  <div
                    key={vote.key_vote_id}
                    className="rounded-lg border border-border bg-card p-3 space-y-1.5"
                  >
                    <p className="text-sm text-foreground leading-snug">
                      {vote.neutral_description}
                    </p>

                    <BillReference vote={vote} jurisdiction={jurisdiction} />

                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <VoteBadge position={vote.vote_position} />
                      <SourceLink vote={vote} jurisdiction={jurisdiction} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
