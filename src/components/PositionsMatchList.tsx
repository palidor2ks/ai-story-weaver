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
  const [openTopic, setOpenTopic] = useState<{ topicId: string; topicName: string; userScore?: number } | null>(null);

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
                    onClick={() => setOpenTopic({ topicId: t.topicId, topicName: t.topicName, userScore })}
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
  topic: { topicId: string; topicName: string; userScore?: number } | null;
  onClose: () => void;
}

interface TopicAnalysis {
  analysis: string;
  sources?: Array<{ url: string; title: string }>;
}

// Render the model's brief: a short lead line + bullet list. The "Your match:" bullet (if any)
// is pulled out and shown as a highlighted footer line. Falls back to plain text if the model
// didn't return bullets (e.g. the data-only fallback string).
const AnalysisBody = ({ text }: { text: string }) => {
  const lines = text.split('\n').map((l) => l.trim().replace(/\*\*/g, '')).filter(Boolean);
  const bullets = lines.filter((l) => /^[-•]\s/.test(l)).map((l) => l.replace(/^[-•]\s*/, ''));
  const lead = lines.filter((l) => !/^[-•]\s/.test(l)).join(' ');

  const matchIdx = bullets.findIndex((b) => /^your match\b/i.test(b));
  const matchLine = matchIdx >= 0 ? bullets.splice(matchIdx, 1)[0] : null;

  return (
    <div className="py-1 space-y-2.5">
      {lead && <p className="text-[14px] text-poli-body leading-relaxed">{lead}</p>}
      {bullets.length > 0 && (
        <ul className="space-y-1.5">
          {bullets.map((b, i) => (
            <li key={i} className="relative pl-4 text-[14px] text-poli-body leading-relaxed">
              <span className="absolute left-0 top-0 text-poli-red">•</span>
              {b}
            </li>
          ))}
        </ul>
      )}
      {matchLine && (
        <p className="mt-1 rounded-lg bg-poli-navy/5 px-3 py-2 text-[13px] font-medium text-poli-navy leading-relaxed">
          {matchLine}
        </p>
      )}
    </div>
  );
};

const TopicAnalysisDialog = ({ candidateId, candidateName, topic, onClose }: TopicAnalysisDialogProps) => {
  const { data, isLoading, isError } = useQuery({
    // userScore is part of the key so the comparison re-fetches if the viewer's stance changes.
    queryKey: ['topic-analysis', candidateId, topic?.topicId, topic?.userScore ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('ai-topic-analysis', {
        body: {
          candidateId,
          topicId: topic!.topicId,
          topicName: topic!.topicName,
          userScore: topic!.userScore,
        },
      });
      if (error) throw error;
      return data as TopicAnalysis;
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
          <>
            <AnalysisBody text={data?.analysis ?? ''} />
            {data?.sources && data.sources.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[rgba(20,23,58,0.08)]">
                <p className="font-mono-label text-[10px] tracking-[1.5px] text-poli-muted mb-1.5">
                  SOURCES
                </p>
                <ul className="space-y-1">
                  {data.sources.map((s, i) => (
                    <li key={`${s.url}-${i}`}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12px] text-poli-navy hover:underline break-words"
                      >
                        {s.title || s.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        <p className="text-[11px] text-poli-muted mt-2">
          AI-generated from this candidate&apos;s record and live sources. May not reflect every nuance.
        </p>
      </DialogContent>
    </Dialog>
  );
};
