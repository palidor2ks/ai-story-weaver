import { Badge } from '@/components/ui/badge';
import { useCommitteeTopic, useCommitteeCauses, CommitteeTopicRow } from '@/hooks/useCommitteeTopics';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';

interface Props {
  fecCommitteeId: string | null | undefined;
  size?: 'sm' | 'md';
  showSecondaries?: boolean;
  className?: string;
  /** Pre-fetched row (skip per-badge query, e.g. in lists). Pass `null` to disable fetching when nothing was found. */
  row?: CommitteeTopicRow | null;
  /** If true, never auto-fetch — only use the `row` prop. */
  disableFetch?: boolean;
}

const stanceClasses = (stance: string) => {
  if (stance === 'pro') return 'border-primary/40 text-primary bg-primary/10';
  if (stance === 'anti') return 'border-destructive/40 text-destructive bg-destructive/10';
  return 'border-muted-foreground/30 text-muted-foreground bg-muted/50';
};

export const CommitteeTopicBadge = ({
  fecCommitteeId,
  size = 'sm',
  showSecondaries = false,
  className,
  row: providedRow,
  disableFetch = false,
}: Props) => {
  const enabled = !disableFetch && providedRow === undefined && !!fecCommitteeId;
  const { data: fetched } = useCommitteeTopic(enabled ? fecCommitteeId : undefined);
  const { data: causes = [] } = useCommitteeCauses(true);
  const row = providedRow !== undefined ? providedRow : fetched;

  const byId = useMemo(() => new Map(causes.map((c) => [c.id, c])), [causes]);
  if (!row) return null;

  const primary = byId.get(row.primary_cause_id);
  if (!primary) return null;

  const secondaries = (row.secondary_cause_ids ?? [])
    .map((id) => byId.get(id))
    .filter(Boolean) as typeof causes;

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
          size === 'md' ? 'text-xs px-2 py-0.5' : 'text-[10px] px-1.5 py-0',
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
