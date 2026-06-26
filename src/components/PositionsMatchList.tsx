import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getTopicDescription } from '@/lib/topicDescriptions';
import { compareStances, stanceBadgeClass, stanceShortLabel } from '@/lib/stance';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface TopicScore {
  topicId: string;
  topicName: string;
  score: number;
}

interface PositionsMatchListProps {
  candidateId: string;
  candidateName: string;
  candidateTopicScores: TopicScore[];
  userTopicScores: Array<{ topic_id: string; score: number }>;
}

interface AIPosition {
  topic: string;
  stance: string;
  detail: string;
}

// Bar color: when we can compute a match, color by stance (navy align / gold partial / red differ);
// otherwise color by the rep's own lean (navy progressive / red conservative / gold mixed).
function barColor(hasMatch: boolean, kind: 'ALIGNS' | 'DIFFERS' | 'PARTIAL', score: number): string {
  if (hasMatch) {
    if (kind === 'ALIGNS') return '#182B7A';
    if (kind === 'DIFFERS') return '#C8102E';
    return '#C19A3F';
  }
  if (score < -0.5) return '#182B7A';
  if (score > 0.5) return '#C8102E';
  return '#C19A3F';
}

function barWidthPct(score: number): number {
  return Math.min(100, Math.max(8, Math.round((Math.abs(score) / 10) * 100)));
}

function leanLabel(score: number): string {
  if (score < -0.5) return 'PROGRESSIVE';
  if (score > 0.5) return 'CONSERVATIVE';
  return 'MIXED';
}

export const PositionsMatchList = ({
  candidateId,
  candidateName,
  candidateTopicScores,
  userTopicScores,
}: PositionsMatchListProps) => {
  const hasUserScores = userTopicScores.length > 0;
  const [openTopic, setOpenTopic] = useState<{ topicId: string; topicName: string } | null>(null);

  // AI one-liner per topic (grounded + cached server-side). Full mode = one per topic.
  const { data: aiPositions } = useQuery({
    queryKey: ['policy-positions-full', candidateId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('ai-policy-card-positions', {
        body: { candidateId, full: true },
      });
      if (error) throw error;
      return (data?.positions ?? []) as AIPosition[];
    },
    staleTime: Infinity,
    enabled: !!candidateId,
  });

  const detailByTopic = useMemo(() => {
    const m = new Map<string, AIPosition>();
    (aiPositions ?? []).forEach((p) => m.set(p.topic.toLowerCase(), p));
    return m;
  }, [aiPositions]);

  const userScoreById = useMemo(() => {
    const m = new Map<string, number>();
    userTopicScores.forEach((u) => m.set(u.topic_id, u.score));
    return m;
  }, [userTopicScores]);

  // Strongest convictions first (matches the design's ordering).
  const rows = useMemo(
    () => [...candidateTopicScores].sort((a, b) => Math.abs(b.score) - Math.abs(a.score)),
    [candidateTopicScores],
  );

  if (rows.length === 0) {
    return (
      <p className="text-sm text-poli-muted py-6 text-center">
        No scored positions available for {candidateName} yet.
      </p>
    );
  }

  return (
    <div>
      <div className="divide-y divide-[rgba(20,23,58,0.08)]">
        {rows.map((t) => {
          const ai = detailByTopic.get(t.topicName.toLowerCase());
          const detail = ai?.detail || getTopicDescription(t.topicId) || '';
          const userScore = userScoreById.get(t.topicId);
          const hasMatch = hasUserScores && userScore !== undefined;
          const kind = hasMatch ? compareStances(t.score, userScore as number) : 'PARTIAL';

          return (
            <div key={t.topicId} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-sans font-bold text-[15px] text-poli-navy leading-tight">
                    {t.topicName}
                  </p>
                  {detail && (
                    <p className="text-[12px] text-poli-dim mt-0.5 leading-snug">{detail}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {hasMatch ? (
                    <span
                      className={cn(
                        'font-mono-label text-[10px] font-bold px-2 py-0.5 rounded-full',
                        stanceBadgeClass(kind),
                      )}
                    >
                      {stanceShortLabel(kind)}
                    </span>
                  ) : (
                    <span className="font-mono-label text-[10px] font-bold text-poli-muted">
                      {leanLabel(t.score)}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={`Analyze ${candidateName}'s position on ${t.topicName}`}
                    onClick={() => setOpenTopic({ topicId: t.topicId, topicName: t.topicName })}
                    className="w-7 h-7 rounded-full bg-poli-surface text-poli-navy flex items-center justify-center hover:bg-poli-navy/10 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {/* Conviction bar — width = strength of lean, color = match (or lean when logged out) */}
              <div className="mt-2 h-1.5 w-full rounded-full bg-poli-surface overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${barWidthPct(t.score)}%`, backgroundColor: barColor(hasMatch, kind, t.score) }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-poli-muted mt-3 leading-snug">
        One-line summaries are AI-generated from each candidate&apos;s scored record, not direct quotes.
        Tap <span className="font-semibold">+</span> for a deeper analysis.
      </p>

      <Link
        to="/compare"
        className="mt-3 block w-full text-center font-semibold text-poli-navy text-sm border border-[rgba(20,23,58,0.12)] rounded-xl py-3 hover:bg-poli-surface transition-colors"
      >
        Compare all {rows.length} issues →
      </Link>

      <TopicAnalysisDialog
        candidateId={candidateId}
        candidateName={candidateName}
        topic={openTopic}
        onClose={() => setOpenTopic(null)}
      />
    </div>
  );
};

// ── "+" deep-dive dialog ─────────────────────────────────────────────
interface TopicAnalysisDialogProps {
  candidateId: string;
  candidateName: string;
  topic: { topicId: string; topicName: string } | null;
  onClose: () => void;
}

const TopicAnalysisDialog = ({ candidateId, candidateName, topic, onClose }: TopicAnalysisDialogProps) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['topic-analysis', candidateId, topic?.topicId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('ai-topic-analysis', {
        body: { candidateId, topicId: topic!.topicId, topicName: topic!.topicName },
      });
      if (error) throw error;
      return data as { analysis: string };
    },
    enabled: !!topic,
    staleTime: Infinity,
  });

  return (
    <Dialog open={!!topic} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-white rounded-2xl">
        <DialogHeader>
          <p className="font-mono-label text-[10px] tracking-[2px] text-poli-red">AI ANALYSIS</p>
          <DialogTitle className="text-poli-navy">
            {candidateName} · {topic?.topicName}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center gap-2 text-poli-dim py-6">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Analyzing position…</span>
          </div>
        ) : isError ? (
          <p className="text-sm text-poli-dim py-4">Couldn&apos;t load the analysis. Please try again.</p>
        ) : (
          <p className="text-[14px] text-poli-body leading-relaxed whitespace-pre-wrap py-1">
            {data?.analysis}
          </p>
        )}
        <p className="text-[11px] text-poli-muted mt-2">
          AI-generated from this candidate&apos;s scored positions. May not reflect every nuance.
        </p>
      </DialogContent>
    </Dialog>
  );
};
