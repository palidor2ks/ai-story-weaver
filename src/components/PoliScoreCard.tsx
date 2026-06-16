import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePoliScoreRecord, topicDisplayName } from '@/hooks/usePoliScoreRecord';

interface PoliScoreCardProps {
  candidateId: string;
  candidateName: string;
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

export function PoliScoreCard({ candidateId, candidateName }: PoliScoreCardProps) {
  const { data: topics = [], isLoading, error } = usePoliScoreRecord(candidateId);

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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          PoliScore — Voting Record
        </CardTitle>

        {/* Trust line */}
        <p className="text-xs text-muted-foreground leading-relaxed mt-1">
          This score is free and can never be bought. It is computed only from public roll-call
          votes, each linked to its source.
        </p>

        {/* Neutrality disclaimer */}
        <p className="text-xs text-muted-foreground/80 italic mt-1">
          Left/Right describes the policy direction of a vote on a disclosed axis, not a
          judgment of which direction is correct.
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {isEmpty ? (
          <p className="text-sm text-muted-foreground py-2">
            Not yet scored — v0 covers House votes only. {candidateName}&apos;s record will
            appear here when Senate key votes are added.
          </p>
        ) : (
          topics.map((topic) => (
            <div key={topic.topic_id}>
              {/* Topic header */}
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm text-foreground">
                  {topicDisplayName(topic.topic_id)}
                </h3>
                <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                  {topic.cast} of {topic.onRecord} key votes cast
                </span>
              </div>

              {/* Vote list */}
              <div className="space-y-3">
                {topic.votes.map((vote) => (
                  <div
                    key={vote.key_vote_id}
                    className="rounded-lg border border-border bg-card p-3 space-y-1.5"
                  >
                    {/* Neutral description — primary text */}
                    <p className="text-sm text-foreground leading-snug">
                      {vote.neutral_description}
                    </p>

                    {/* Bill reference — secondary */}
                    <p className="text-xs text-muted-foreground">
                      {vote.bill_type.toUpperCase()}
                      {vote.bill_number} ({vote.congress}th Congress) —{' '}
                      <span className="italic">{vote.title}</span>
                    </p>

                    {/* Vote + source link */}
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <VoteBadge position={vote.vote_position} />
                      <a
                        href={vote.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        aria-label={`View ${vote.bill_type.toUpperCase()}${vote.bill_number} on Congress.gov`}
                      >
                        View on Congress.gov
                        <ExternalLink className="w-3 h-3" />
                      </a>
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
