import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { useCommitteeTopic, useCommitteeCauses, CommitteeTopicRow } from '@/hooks/useCommitteeTopics';
import { useCommitteePrimaryCandidate, CommitteePrimaryCandidate } from '@/hooks/useCommitteeCandidates';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';

interface Props {
  fecCommitteeId: string | null | undefined;
  size?: 'sm' | 'md';
  showSecondaries?: boolean;
  className?: string;
  /** Pre-fetched row (skip per-badge query, e.g. in lists). Pass `null` to disable fetching when nothing was found. */
  row?: CommitteeTopicRow | null;
  /** Pre-fetched single-candidate mapping (skip per-badge query in lists). Pass `null` for "not a single-candidate committee". */
  candidate?: CommitteePrimaryCandidate | null;
  /** If true, never auto-fetch — only use the `row` / `candidate` props. */
  disableFetch?: boolean;
}

const stanceClasses = (stance: string) => {
  if (stance === 'pro') return 'border-primary/40 text-primary bg-primary/10';
  if (stance === 'anti') return 'border-destructive/40 text-destructive bg-destructive/10';
  return 'border-muted-foreground/30 text-muted-foreground bg-muted/50';
};

const partyClasses = (party?: string | null) => {
  const p = (party ?? '').toLowerCase();
  if (p.startsWith('rep')) return 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300';
  if (p.startsWith('dem')) return 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-300';
  if (p.startsWith('ind')) return 'border-purple-500/40 bg-purple-500/10 text-purple-600 dark:text-purple-300';
  return 'border-muted-foreground/30 text-muted-foreground bg-muted/50';
};

export const CommitteeTopicBadge = ({
  fecCommitteeId,
  size = 'sm',
  showSecondaries = false,
  className,
  row: providedRow,
  candidate: providedCandidate,
  disableFetch = false,
}: Props) => {
  const rowEnabled = !disableFetch && providedRow === undefined && !!fecCommitteeId;
  const { data: fetchedRow } = useCommitteeTopic(rowEnabled ? fecCommitteeId : undefined);
  const candEnabled = !disableFetch && providedCandidate === undefined && !!fecCommitteeId;
  const { data: fetchedCandidate } = useCommitteePrimaryCandidate(candEnabled ? fecCommitteeId : undefined);
  const { data: causes = [] } = useCommitteeCauses(true);

  const row = providedRow !== undefined ? providedRow : fetchedRow;
  const candidate = providedCandidate !== undefined ? providedCandidate : fetchedCandidate;

  const byId = useMemo(() => new Map(causes.map((c) => [c.id, c])), [causes]);

  const sizeCls = size === 'md' ? 'text-xs px-2 py-0.5' : 'text-[10px] px-1.5 py-0';
  const primary = row ? byId.get(row.primary_cause_id) : undefined;
  const secondaries = row
    ? ((row.secondary_cause_ids ?? []).map((id) => byId.get(id)).filter(Boolean) as typeof causes)
    : [];

  // Single-candidate committee → the candidate IS the primary cause.
  if (candidate) {
    const tip = [
      'Single-candidate committee — primary cause is the candidate',
      [candidate.party, candidate.office, candidate.state].filter(Boolean).join(' · ') || null,
    ]
      .filter(Boolean)
      .join('\n');
    return (
      <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
        <Badge variant="outline" className={cn('gap-1', partyClasses(candidate.party), sizeCls)} title={tip}>
          <Link to={`/candidate/${candidate.id}`} className="hover:underline">{candidate.name}</Link>
        </Badge>
        {showSecondaries && primary && (
          <Badge
            variant="outline"
            className={cn('text-[10px] px-1.5 py-0', stanceClasses(primary.stance))}
            title={primary.description ?? ''}
          >
            {primary.label}
          </Badge>
        )}
      </div>
    );
  }

  if (!row || !primary) return null;

  const tooltip = [
    primary.description,
    `Issue: ${primary.issue}`,
    row.ai_reasoning ? `${row.assigned_by === 'admin' ? 'Admin' : 'AI'}: ${row.ai_reasoning}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <Badge
        variant="outline"
        className={cn(
          'gap-1',
          stanceClasses(primary.stance),
          sizeCls,
        )}
        title={tooltip}
      >
        <span>{primary.label}</span>
      </Badge>
      {showSecondaries &&
        secondaries.map((c) => (
          <Badge
            key={c.id}
            variant="outline"
            className={cn('text-[10px] px-1.5 py-0', stanceClasses(c.stance))}
            title={c.description ?? ''}
          >
            {c.label}
          </Badge>
        ))}
    </div>
  );
};
