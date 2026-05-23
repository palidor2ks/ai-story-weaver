import { ReactNode, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DialogClose,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Sparkles, Loader2, ExternalLink, AlertTriangle, BookOpen, RefreshCw, X, Globe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

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

export const BillAIAnalysisDialog = ({
  billId, billType, billNumber, billName, congress, topic, status, billUrl, sponsorshipDate,
  candidateName, candidateParty, candidateOffice, candidateState, isSponsor, trigger,
}: Props) => {
  const [analysis, setAnalysis] = useState<BillAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const billLabel = billType && billNumber ? `${String(billType).toUpperCase()} ${billNumber}` : billName;

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
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto [&>button:last-child]:hidden">
        <DialogHeader className="sticky top-0 z-10 bg-background pb-2 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5 min-w-0">
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="truncate">{billLabel}: {billName}</span>
              </DialogTitle>
              <DialogDescription>
                AI-generated analysis of this bill and {candidateName}'s {isSponsor ? 'sponsorship' : 'cosponsorship'} — grounded in live web search.
              </DialogDescription>
            </div>
            {analysis && !isLoading && (
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={() => fetchAnalysis(true)}>

                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Regenerate
                </Button>
                <DialogClose asChild>
                  <Button size="icon" variant="ghost" aria-label="Close analysis dialog">
                    <X className="h-4 w-4" />
                  </Button>
                </DialogClose>
              </div>
            )}
            {!analysis && (
              <DialogClose asChild>
                <Button size="icon" variant="ghost" aria-label="Close analysis dialog" className="shrink-0">
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            )}
          </div>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Searching the web and analyzing the bill…</span>
          </div>
        )}

        {error && !isLoading && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 rounded-md border border-destructive/30 bg-destructive/5 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
            <Button size="sm" variant="outline" onClick={() => fetchAnalysis(false)}>Retry</Button>
          </div>
        )}

        {analysis && !isLoading && (
          <div className="space-y-5 text-sm">
            {analysis.insufficient_information && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Insufficient public information to confidently analyze this bill. Treat the analysis below as tentative.</span>
              </div>
            )}

            {typeof analysis.confidence === 'number' && (
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                {(() => {
                  const c = Math.max(0, Math.min(100, Math.round(analysis.confidence!)));
                  const tone = c >= 70 ? 'bg-emerald-500' : c >= 40 ? 'bg-amber-500' : 'bg-destructive';
                  const label = c >= 70 ? 'High' : c >= 40 ? 'Medium' : 'Low';
                  return (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Confidence</span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full ${tone}`} style={{ width: `${c}%` }} />
                      </div>
                      <span className="text-xs font-semibold tabular-nums">{c}/100 · {label}</span>
                    </div>
                  );
                })()}
                {analysis.confidence_rationale && (
                  <p className="text-xs text-muted-foreground italic">{analysis.confidence_rationale}</p>
                )}
              </div>
            )}

            <p className="text-foreground leading-relaxed">{analysis.summary}</p>

            {analysis.key_provisions && analysis.key_provisions.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground">Key provisions</h4>
                <ul className="list-disc pl-5 space-y-1 text-foreground">
                  {analysis.key_provisions.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </div>
            )}

            {analysis.candidate_role_explanation && (
              <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                <h4 className="font-semibold text-foreground text-xs uppercase tracking-wide">
                  Why {candidateName} {isSponsor ? 'sponsored' : 'cosponsored'} it
                </h4>
                <p className="text-foreground leading-relaxed">{analysis.candidate_role_explanation}</p>
              </div>
            )}

            {analysis.positions && analysis.positions.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground">Policy positions</h4>
                <ul className="space-y-1.5">
                  {analysis.positions.map((p, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-medium text-foreground">{p.topic}:</span>{' '}
                      <span className="text-muted-foreground">{p.stance}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.supporters && analysis.supporters.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-foreground leading-relaxed">
                  <strong>Supporters:</strong> {toOneSentence(analysis.supporters)}
                </p>
              </div>
            )}

            {analysis.opponents && analysis.opponents.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-foreground leading-relaxed">
                  <strong>Opponents:</strong> {toOneSentence(analysis.opponents)}
                </p>
              </div>
            )}

            {analysis.controversies && analysis.controversies.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-foreground leading-relaxed">
                  <strong>Controversies:</strong> {toOneSentence(analysis.controversies)}
                </p>
              </div>
            )}

            {analysis.public_context_claims && analysis.public_context_claims.length > 0 && (
              <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                <h4 className="font-semibold text-foreground flex items-center gap-1.5 text-xs uppercase tracking-wide">
                  <Globe className="h-3.5 w-3.5 text-primary" />
                  From public context
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-foreground">
                  {analysis.public_context_claims.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
                <p className="text-[11px] text-muted-foreground italic">
                  Numbers in brackets [n] reference the Sources list below.
                </p>
              </div>
            )}

            {analysis.analysis && (
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground">Deeper analysis</h4>
                <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">{analysis.analysis}</p>
              </div>
            )}

            <div className="space-y-2 pt-2 border-t border-border">
              <h4 className="font-semibold text-foreground flex items-center gap-1.5">
                <BookOpen className="h-4 w-4 text-primary" />
                Sources & citations
              </h4>
              {analysis.sources?.length > 0 ? (
                <ol className="space-y-1 list-decimal pl-5">
                  {analysis.sources.map((s, i) => (
                    <li key={i}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        [{i + 1}] {s.title}
                      </a>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  {analysis.provider_errors && analysis.provider_errors.length > 0
                    ? `External citation providers were unavailable (${analysis.provider_errors.map(p => `${p.provider} ${p.status}`).join(', ')}). This response used the fallback model and should be treated as tentative.`
                    : 'No external sources cited. Treat this analysis as tentative.'}
                </p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              AI-generated. May be incomplete or include errors. Verify with linked sources.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BillAIAnalysisDialog;
