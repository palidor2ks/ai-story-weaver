import { Badge } from '@/components/ui/badge';
import { TopicIcon } from '@/components/TopicIcon';
import { useTopics } from '@/hooks/useCandidates';
import { useCommitteeTopic, CommitteeTopicRow } from '@/hooks/useCommitteeTopics';
import { cn } from '@/lib/utils';

interface Props {
  fecCommitteeId: string | null | undefined;
  size?: 'sm' | 'md';
  showSecondaries?: boolean;
  className?: string;
  /** Pre-fetched row (skip per-badge query, e.g. in lists). */
  row?: CommitteeTopicRow | null;
}

export const CommitteeTopicBadge = ({
  fecCommitteeId,
  size = 'sm',
  showSecondaries = false,
  className,
  row: providedRow,
}: Props) => {
  const enabled = !providedRow && !!fecCommitteeId;
  const { data: fetched } = useCommitteeTopic(enabled ? fecCommitteeId : undefined);
  const { data: topics = [] } = useTopics();
  const row = providedRow ?? fetched;
  if (!row) return null;

  const byId = new Map(topics.map((t: any) => [t.id, t]));
  const primary = byId.get(row.primary_topic_id);
  if (!primary) return null;

  const secondaries = (row.secondary_topic_ids ?? [])
    .map((id) => byId.get(id))
    .filter(Boolean) as any[];

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <Badge
        variant="outline"
        className={cn(
          'gap-1 border-primary/40 text-primary bg-primary/5',
          size === 'md' ? 'text-xs px-2 py-0.5' : 'text-[10px] px-1.5 py-0',
        )}
        title={
          row.ai_reasoning
            ? `${row.assigned_by === 'admin' ? 'Admin' : 'AI'}: ${row.ai_reasoning}`
            : row.assigned_by === 'admin'
              ? 'Set by admin'
              : 'Suggested by AI'
        }
      >
        <TopicIcon name={primary.icon} className={size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
        <span>{primary.displayName || primary.name}</span>
      </Badge>
      {showSecondaries &&
        secondaries.map((t) => (
          <Badge key={t.id} variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
            <TopicIcon name={t.icon} className="w-3 h-3" />
            <span>{t.displayName || t.name}</span>
          </Badge>
        ))}
    </div>
  );
};
