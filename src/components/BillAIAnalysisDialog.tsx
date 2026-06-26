import { ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DialogClose,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, ExternalLink, AlertTriangle, BookOpen, RefreshCw, X, Globe, ThumbsUp, ThumbsDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ShareAIAnalysisButton } from '@/components/ShareAIAnalysisButton';

export interface BillAnalysis {
  summary: string;
  analysis: string;
  key_provisions?: string[];
  positions?: { topic: string; stance: string }[];
  candidate_role_explanation?: string;
  supporters?: string[];
  opponents?: string[];
  controversies?: string[];
  public_context_claims?: string[];
  insufficient_information: boolean;
  confidence?: number;
  confidence_rationale?: string;
  sources: { title: string; url: string }[];
  provider?: string;
  provider_errors?: { provider: string; status: number; code: string }[];
}

interface Props {
  billId?: string;
  billType?: string | null;
  billNumber?: string | number | null;
  billName: string;
  congress?: string | number | null;
  topic?: string | null;
  status?: string | null;
  billUrl?: string | null;
  sponsorshipDate?: string | null;
  candidateName: string;
  candidateParty?: string | null;
  candidateOffice?: string | null;
  candidateState?: string | null;
  isSponsor: boolean;
  votePosition?: string | null;
  userAlignment?: 'support' | 'oppose' | 'unknown';
  trigger: ReactNode;
}

const normalizeInvokeError = (raw: unknown): string => {
  const message = typeof raw === 'string'
    ? raw
    : (typeof raw === 'object' && raw !== null && 'message' in raw && typeof (raw as { message?: unknown }).message === 'string')
      ? (raw as { message: string }).message
      : 'Failed to load analysis';
  const jsonMatch = message.match(/\{[\s\S]*\}$/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed?.error && typeof parsed.error === 'string') return parsed.error;
    } catch { /* ignore */ }
  }
  if (/failed to send a request to the edge function|failed to fetch|fetch failed|networkerror|load failed|timeout/i.test(message)) {
    return 'Could not reach the AI service. Please check your connection and try again.';
  }
  return message;
};

const toOneSentence = (items: unknown[]) => {
  const parts = items
    .map((item) => (item == null ? '' : String(item)).trim().replace(/\.$/, ''))
    .filter(Boolean);
  return parts.length > 0 ? parts.join('; ') + '.' : '';
};

const statusBadgeClass = (status: string | null | undefined) => {
  if (!status) return 'bg-poli-navy/10 text-poli-navy';
  const s = status.toUpperCase();
  if (s.includes('ENACTED') || s.includes('SIGNED')) return 'bg-emerald-500/15 text-emerald-700';
  if (s.includes('VETOED') || s.includes('FAILED')) return 'bg-destructive/15 text-destructive';
  if (s.includes('PASSED')) return 'bg-blue-500/15 text-blue-700';
  return 'bg-poli-navy/10 text-poli-navy';
};

export const BillAIAnalysisDialog = ({
  billId, billType, billNumber, billName, congress, topic, status, billUrl, sponsorshipDate,
  candidateName, candidateParty, candidateOffice, candidateState, isSponsor,
  votePosition, userAlignment, trigger,
}: Props) => {
  const [analysis, setAnalysis] = useState<BillAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const billLabel = billType && billNumber ? `${String(billType).toUpperCase()} ${billNumber}` : null;

  const roleLabel = (() => {
    const p = (votePosition ?? '').toLowerCase();
    if (p === 'sponsored') return 'sponsored';
    if (p === 'cosponsored') return 'cosponsored';
    if (p === 'yea' || p === 'aye') return 'voted Yes on';
    if (p === 'nay' || p === 'no') return 'voted No on';
    return isSponsor ? 'sponsored' : 'cosponsored';
  })();

  const fetchAnalysis = async (force = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-bill-analysis', {
        body: {
          bill_id: billId ?? null,
          bill_type: billType ?? null,
          bill_number: billNumber ?? null,
          bill_name: billName,
          congress: congress ?? null,
          topic: topic ?? null,
          status: status ?? null,
          bill_url: billUrl ?? null,
          sponsorship_date: sponsorshipDate ?? null,
          candidate_name: candidateName,
          candidate_party: candidateParty ?? null,
          candidate_office: candidateOffice ?? null,
          candidate_state: candidateState ?? null,
          is_sponsor: isSponsor,
          vote_position: votePosition ?? null,
          force_refresh: force,
        },
      });
      if (fnError) throw new Error(normalizeInvokeError(fnError));
      if ((data as { error?: string } | undefined)?.error) {
        throw new Error(String((data as { error: string }).error));
      }
      setAnalysis(data as BillAnalysis);
    } catch (e) {
      console.error('Bill analysis failed', e);
      setError(normalizeInvokeError(e));
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (open && !analysis && !isLoading) fetchAnalysis();
  };

  return (
    <Dialog onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl p-0 overflow-hidden max-h-[85vh] flex flex-col [&>button:last-child]:hidden">
        {/* Gradient header */}
        <DialogHeader className="bg-gradient-to-br from-poli-navy to-poli-dark rounded-t-2xl p-5 relative shrink-0">
          <DialogClose asChild>
            <button
              aria-label="Close analysis dialog"
              className="absolute right-4 top-4 text-white/70 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </DialogClose>
          <div className="min-w-0 pr-8">
            <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-1">
              Bill Analysis
            </p>
            {billLabel && (
              <p className="font-mono-label text-xs text-white/70 mb-0.5">{billLabel}</p>
            )}
            <DialogTitle className="text-xl font-black text-white leading-tight min-w-0 break-words">
              {billName}
            </DialogTitle>
            <DialogDescription className="text-sm text-white/60 mt-0.5">
              AI analysis · {candidateName} {roleLabel} it
            </DialogDescription>
            {status && (
              <span className={`inline-block mt-2 font-mono-label text-xs font-bold px-2 py-0.5 rounded-full ${statusBadgeClass(status)}`}>
                {status.toUpperCase()}
              </span>
            )}
          </div>
          {analysis && !isLoading && (
            <div className="flex flex-wrap items-center gap-2 pt-3">
              {!analysis.insufficient_information && (
                <ShareAIAnalysisButton
                  subjectName={billLabel ? `${billLabel}: ${billName}` : billName}
                  subtitle="Bill Analysis"
                  subjectKind="bill"
                  summary={analysis.summary}
                  confidence={analysis.confidence}
                />
              )}
              <Button
                size="sm"
                onClick={() => fetchAnalysis(true)}
                className="bg-poli-navy text-white rounded-xl h-10 px-4 text-sm font-semibold border border-white/30 hover:bg-poli-dark"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Regenerate
              </Button>
            </div>
          )}
        </DialogHeader>

        {/* Scrollable content area */}
        <div className="bg-[#F5F6FA] p-4 overflow-y-auto overflow-x-hidden flex-1 min-h-0">
          {isLoading && (
            <div className="flex items-center justify-center py-12 gap-3 text-poli-body">
              <Loader2 className="h-5 w-5 animate-spin border-poli-navy" />
              <span>Searching the web and analyzing the bill…</span>
            </div>
          )}

          {error && !isLoading && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 rounded-xl border border-destructive/30 bg-destructive/5 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
              <Button
                size="sm"
                onClick={() => fetchAnalysis(false)}
                className="border border-poli-navy text-poli-navy rounded-xl h-10 px-4 text-sm font-semibold bg-transparent hover:bg-poli-navy/5"
              >
                Retry
              </Button>
            </div>
          )}

          {analysis && !isLoading && (
            <div className="space-y-3 text-sm min-w-0 break-words">
              {analysis.insufficient_information && (
                <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-700">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Insufficient public information to confidently analyze this bill. Treat the analysis below as tentative.</span>
                </div>
              )}

              {typeof analysis.confidence === 'number' && (
                <div className="bg-white rounded-xl p-4 mb-3 shadow-sm space-y-2">
                  <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-2">
                    Confidence
                  </p>
                  {(() => {
                    const c = Math.max(0, Math.min(100, Math.round(analysis.confidence!)));
                    const tone = c >= 70 ? 'bg-emerald-500' : c >= 40 ? 'bg-amber-500' : 'bg-destructive';
                    const label = c >= 70 ? 'High' : c >= 40 ? 'Medium' : 'Low';
                    return (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-poli-muted whitespace-nowrap">Score</span>
                        <div className="flex-1 h-1.5 rounded-full bg-poli-surface overflow-hidden">
                          <div className={`h-full ${tone}`} style={{ width: `${c}%` }} />
                        </div>
                        <span className="text-xs font-semibold tabular-nums">{c}/100 · {label}</span>
                      </div>
                    );
                  })()}
                  {analysis.confidence_rationale && (
                    <p className="text-xs text-poli-muted italic">{analysis.confidence_rationale}</p>
                  )}
                </div>
              )}

              {userAlignment && userAlignment !== 'unknown' && (
                <div className={cn(
                  "flex items-start gap-2 p-3 rounded-xl border text-sm",
                  userAlignment === 'support'
                    ? "bg-agree/10 border-agree/30 text-agree"
                    : "bg-disagree/10 border-disagree/30 text-disagree"
                )}>
                  {userAlignment === 'support'
                    ? <ThumbsUp className="h-4 w-4 mt-0.5 shrink-0" />
                    : <ThumbsDown className="h-4 w-4 mt-0.5 shrink-0" />}
                  <span>
                    <strong>Based on your quiz answers</strong>, you'd likely{' '}
                    <strong>{userAlignment === 'support' ? 'agree' : 'disagree'}</strong>{' '}
                    with this vote. See "Policy positions" below to understand why.
                  </span>
                </div>
              )}

              <div className="bg-white rounded-xl p-4 mb-3 shadow-sm">
                <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-2">
                  Summary
                </p>
                <p className="text-poli-body leading-relaxed">{analysis.summary}</p>
              </div>

              {analysis.key_provisions && analysis.key_provisions.length > 0 && (
                <div className="bg-white rounded-xl p-4 mb-3 shadow-sm">
                  <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-2">
                    Key provisions
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-poli-body">
                    {analysis.key_provisions.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}

              {analysis.candidate_role_explanation && (
                <div className="bg-white rounded-xl p-4 mb-3 shadow-sm">
                  <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-2">
                    Why {candidateName} {roleLabel} it
                  </p>
                  <p className="text-poli-body leading-relaxed">{analysis.candidate_role_explanation}</p>
                </div>
              )}

              {analysis.positions && analysis.positions.length > 0 && (
                <div className="bg-white rounded-xl p-4 mb-3 shadow-sm">
                  <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-2">
                    Policy positions
                  </p>
                  <ul className="space-y-1.5">
                    {analysis.positions.map((p, i) => (
                      <li key={i} className="text-sm">
                        <span className="font-medium text-poli-body">{p.topic}:</span>{' '}
                        <span className="text-poli-muted">{p.stance}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.supporters && analysis.supporters.length > 0 && (
                <div className="bg-white rounded-xl p-4 mb-3 shadow-sm">
                  <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-2">
                    Supporters
                  </p>
                  <p className="text-poli-body leading-relaxed">{toOneSentence(analysis.supporters)}</p>
                </div>
              )}

              {analysis.opponents && analysis.opponents.length > 0 && (
                <div className="bg-white rounded-xl p-4 mb-3 shadow-sm">
                  <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-2">
                    Opponents
                  </p>
                  <p className="text-poli-body leading-relaxed">{toOneSentence(analysis.opponents)}</p>
                </div>
              )}

              {analysis.controversies && analysis.controversies.length > 0 && (
                <div className="bg-white rounded-xl p-4 mb-3 shadow-sm">
                  <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-2">
                    Controversies
                  </p>
                  <p className="text-poli-body leading-relaxed">{toOneSentence(analysis.controversies)}</p>
                </div>
              )}

              {analysis.public_context_claims && analysis.public_context_claims.length > 0 && (
                <div className="bg-white rounded-xl p-4 mb-3 shadow-sm">
                  <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" />
                    From public context
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-poli-body">
                    {analysis.public_context_claims.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                  <p className="text-[11px] text-poli-muted italic mt-2">
                    Numbers in brackets [n] reference the Sources list below.
                  </p>
                </div>
              )}

              {analysis.analysis && (
                <div className="bg-white rounded-xl p-4 mb-3 shadow-sm">
                  <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-2">
                    Deeper analysis
                  </p>
                  <p className="text-poli-muted whitespace-pre-wrap leading-relaxed">{analysis.analysis}</p>
                </div>
              )}

              <div className="bg-white rounded-xl p-4 mb-3 shadow-sm">
                <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5" />
                  Sources & citations
                </p>
                {analysis.sources?.length > 0 ? (
                  <ol className="space-y-1 list-decimal pl-5">
                    {analysis.sources.map((s, i) => (
                      <li key={i}>
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-poli-navy hover:underline inline-flex items-start gap-1 max-w-full align-top"
                        >
                          <ExternalLink className="h-3 w-3 mt-0.5 shrink-0" />
                          <span className="min-w-0 break-words">[{i + 1}] {s.title}</span>
                        </a>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-xs text-poli-muted italic">
                    {analysis.provider_errors && analysis.provider_errors.length > 0
                      ? `External citation providers were unavailable (${analysis.provider_errors.map(p => `${p.provider} ${p.status}`).join(', ')}). This response used the fallback model and should be treated as tentative.`
                      : 'No external sources cited. Treat this analysis as tentative.'}
                  </p>
                )}
              </div>

              <p className="text-xs text-poli-muted pb-2">
                AI-generated. May be incomplete or include errors. Verify with linked sources.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BillAIAnalysisDialog;
