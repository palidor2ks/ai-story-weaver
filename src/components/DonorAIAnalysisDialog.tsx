import { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { Sparkles, Loader2, ExternalLink, AlertTriangle, Database, Globe, BookOpen, RefreshCw, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export interface DonorAnalysis {
  summary: string;
  analysis: string;
  party_support: { party: string; amount: number; share: number }[];
  causes: string[];
  motivation_hypotheses?: string[];
  positions?: { topic: string; stance: string }[];
  goals?: string[];
  key_people?: string[];
  notable_recipients?: string[];
  controversies?: string[];
  finance_claims?: string[];
  public_context_claims?: string[];
  insufficient_information: boolean;
  confidence?: number;
  confidence_rationale?: string;
  data_coverage?: 'none' | 'sparse' | 'moderate' | 'rich';
  sources: { title: string; url: string }[];
  provider?: string;
  provider_errors?: { provider: string; status: number; code: string }[];
}

interface Props {
  id: string;
  name: string;
  type: 'Individual' | 'PAC' | 'Organization' | 'Unknown' | string;
  cycle?: string;
  /** Optional link to a full profile page rendered at the bottom of the dialog. */
  profileHref?: string;
  /** Custom trigger element. Must be a single React node (rendered via DialogTrigger asChild). */
  trigger: ReactNode;
}

const formatAmount = (amount: number) => {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount}`;
};

const partyColor = (party: string) => {
  const p = party.toLowerCase();
  if (p.startsWith('dem')) return 'bg-blue-500';
  if (p.startsWith('rep')) return 'bg-red-500';
  if (p.startsWith('ind')) return 'bg-purple-500';
  return 'bg-muted-foreground';
};

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

export const DonorAIAnalysisDialog = ({ id, name, type, cycle, profileHref, trigger }: Props) => {
  const [analysis, setAnalysis] = useState<DonorAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = async (force = false) => {
    setIsLoading(true);
    setError(null);

    const invokeOnce = () => supabase.functions.invoke('ai-donor-analysis', {
      body: { donor_id: id, donor_name: name, donor_type: type, cycle, force_refresh: force },
    });

    try {
      let data: unknown;
      let fnError: unknown;

      for (let attempt = 1; attempt <= 3; attempt++) {
        const result = await invokeOnce();
        data = result.data;
        fnError = result.error;
        if (!fnError) break;

        const isRetryable = /failed to send a request to the edge function|failed to fetch|fetch failed|networkerror|load failed|timeout/i.test(
          normalizeInvokeError(fnError),
        );
        if (attempt < 3 && isRetryable) {
          const delayMs = attempt === 1 ? 1200 : 2500;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        break;
      }

      if (fnError) throw new Error(normalizeInvokeError(fnError));
      if ((data as { error?: string } | undefined)?.error) {
        throw new Error(String((data as { error: string }).error));
      }
      setAnalysis(data as DonorAnalysis);
    } catch (e) {
      console.error('Donor analysis failed', e);
      setError(normalizeInvokeError(e));
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (open && !analysis && !isLoading) {
      fetchAnalysis();
    }
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
                {name}
              </DialogTitle>
              <DialogDescription>
                AI-generated donor analysis grounded in campaign-finance data and broader public context.
              </DialogDescription>
            </div>
            {analysis && !isLoading && (
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={fetchAnalysis}>
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
            <span>Generating analysis…</span>
          </div>
        )}

        {error && !isLoading && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 rounded-md border border-destructive/30 bg-destructive/5 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
            <Button size="sm" variant="outline" onClick={fetchAnalysis}>Retry</Button>
          </div>
        )}

        {analysis && !isLoading && (
          <div className="space-y-5 text-sm">
            {analysis.insufficient_information && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Insufficient public information available for a confident profile. Treat the analysis below as tentative.</span>
              </div>
            )}

            {(typeof analysis.confidence === 'number' || analysis.data_coverage) && (
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  {analysis.data_coverage && (() => {
                    const cfg = {
                      none:     { label: 'No filings',      tone: 'bg-destructive/15 text-destructive border-destructive/30' },
                      sparse:   { label: 'Sparse filings',  tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30' },
                      moderate: { label: 'Moderate filings',tone: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30' },
                      rich:     { label: 'Rich filings',    tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' },
                    }[analysis.data_coverage];
                    return (
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md border ${cfg.tone}`}>
                        <Database className="h-3.5 w-3.5" />
                        Data coverage: {cfg.label}
                      </span>
                    );
                  })()}
                  {typeof analysis.confidence === 'number' && (() => {
                    const c = Math.max(0, Math.min(100, Math.round(analysis.confidence)));
                    const tone = c >= 70 ? 'bg-emerald-500' : c >= 40 ? 'bg-amber-500' : 'bg-destructive';
                    const label = c >= 70 ? 'High' : c >= 40 ? 'Medium' : 'Low';
                    return (
                      <div className="flex items-center gap-2 min-w-[200px] flex-1">
                        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                          Confidence
                        </span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full ${tone}`} style={{ width: `${c}%` }} />
                        </div>
                        <span className="text-xs font-semibold tabular-nums">{c}/100 · {label}</span>
                      </div>
                    );
                  })()}
                </div>
                {analysis.confidence_rationale && (
                  <p className="text-xs text-muted-foreground italic">
                    {analysis.confidence_rationale}
                  </p>
                )}
              </div>
            )}

            <p className="text-foreground leading-relaxed">{analysis.summary}</p>

            {analysis.party_support?.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground">Party support</h4>
                <div className="space-y-1.5">
                  {analysis.party_support.map((p) => (
                    <div key={p.party} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium">{p.party}</span>
                        <span className="text-muted-foreground">
                          {formatAmount(p.amount)} · {(p.share * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full ${partyColor(p.party)}`}
                          style={{ width: `${Math.min(100, p.share * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysis.positions && analysis.positions.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground">Positions</h4>
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

            {analysis.goals && analysis.goals.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-foreground leading-relaxed">
                  <strong>Goals:</strong> {toOneSentence(analysis.goals)}
                </p>
              </div>
            )}

            {analysis.causes?.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground">Likely causes</h4>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.causes.map((c, i) => (
                    <Badge key={i} variant="secondary">{c}</Badge>
                  ))}
                </div>
              </div>
            )}

            {analysis.notable_recipients && analysis.notable_recipients.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-foreground leading-relaxed">
                  <strong>Notable recipients:</strong> {toOneSentence(analysis.notable_recipients)}
                </p>
              </div>
            )}

            {analysis.key_people && analysis.key_people.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-foreground leading-relaxed">
                  <strong>Key people:</strong> {toOneSentence(analysis.key_people)}
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

            {analysis.motivation_hypotheses && analysis.motivation_hypotheses.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-foreground leading-relaxed">
                  <strong>Possible motivations:</strong> {toOneSentence(analysis.motivation_hypotheses)}
                </p>
              </div>
            )}

            {analysis.finance_claims && analysis.finance_claims.length > 0 && (
              <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                <h4 className="font-semibold text-foreground flex items-center gap-1.5 text-xs uppercase tracking-wide">
                  <Database className="h-3.5 w-3.5 text-primary" />
                  From finance signals
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-foreground">
                  {analysis.finance_claims.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.public_context_claims && analysis.public_context_claims.length > 0 && (
              <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                <h4 className="font-semibold text-foreground flex items-center gap-1.5 text-xs uppercase tracking-wide">
                  <Globe className="h-3.5 w-3.5 text-primary" />
                  From public context
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-foreground">
                  {analysis.public_context_claims.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
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
                    ? `External citation providers were unavailable (${analysis.provider_errors.map(p => `${p.provider} ${p.status}`).join(', ')}). This response used the fallback model, which cannot return external citations — treat as tentative.`
                    : "No external sources cited. Public-context claims reflect the model's background knowledge and should be independently verified."}
                </p>
              )}
            </div>

            {profileHref && (
              <div className="pt-2">
                <Link to={profileHref}>
                  <Button size="sm">Open full profile</Button>
                </Link>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              AI-generated. May be incomplete or include errors. Verify with linked sources.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
