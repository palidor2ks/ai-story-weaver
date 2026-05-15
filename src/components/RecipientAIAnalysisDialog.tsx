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
import { Sparkles, Loader2, ExternalLink, AlertTriangle, Database, Globe, BookOpen, RefreshCw, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export interface RecipientAnalysis {
  summary: string;
  analysis: string;
  positions?: { topic: string; stance: string }[];
  goals?: string[];
  key_people?: string[];
  notable_recipients?: string[];
  controversies?: string[];
  causes?: string[];
  finance_claims?: string[];
  public_context_claims?: string[];
  insufficient_information: boolean;
  confidence?: number;
  confidence_rationale?: string;
  data_coverage?: 'none' | 'sparse' | 'moderate' | 'rich';
  sources: { title: string; url: string }[];
}

interface Props {
  entityKind: 'candidate' | 'committee';
  entityId: string;
  entityName: string;
  fecId?: string | null;
  party?: string | null;
  office?: string | null;
  state?: string | null;
  cycle?: string | null;
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

export const RecipientAIAnalysisDialog = ({
  entityKind, entityId, entityName, fecId, party, office, state, cycle, trigger,
}: Props) => {
  const [analysis, setAnalysis] = useState<RecipientAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-recipient-analysis', {
        body: {
          entity_kind: entityKind,
          entity_id: entityId,
          entity_name: entityName,
          fec_id: fecId ?? null,
          party: party ?? null,
          office: office ?? null,
          state: state ?? null,
          cycle: cycle ?? null,
        },
      });
      if (fnError) throw new Error(normalizeInvokeError(fnError));
      if ((data as { error?: string } | undefined)?.error) {
        throw new Error(String((data as { error: string }).error));
      }
      setAnalysis(data as RecipientAnalysis);
    } catch (e) {
      console.error('Recipient analysis failed', e);
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
                {entityName}
              </DialogTitle>
              <DialogDescription>
                AI-generated analysis of this {entityKind}'s positions, goals, and political activity — grounded in live web search.
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
            <span>Searching the web and generating analysis…</span>
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
                <span>Insufficient public information to confidently identify this entity. Treat the analysis below as tentative.</span>
              </div>
            )}

            {(typeof analysis.confidence === 'number' || analysis.data_coverage) && (
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  {analysis.data_coverage && (() => {
                    const cfg = {
                      none: { label: 'No filings', tone: 'bg-destructive/15 text-destructive border-destructive/30' },
                      sparse: { label: 'Sparse filings', tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30' },
                      moderate: { label: 'Moderate filings', tone: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30' },
                      rich: { label: 'Rich filings', tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' },
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
                        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Confidence</span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full ${tone}`} style={{ width: `${c}%` }} />
                        </div>
                        <span className="text-xs font-semibold tabular-nums">{c}/100 · {label}</span>
                      </div>
                    );
                  })()}
                </div>
                {analysis.confidence_rationale && (
                  <p className="text-xs text-muted-foreground italic">{analysis.confidence_rationale}</p>
                )}
              </div>
            )}

            <p className="text-foreground leading-relaxed">{analysis.summary}</p>

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
                <h4 className="font-semibold text-foreground">What they're trying to achieve</h4>
                <ul className="list-disc pl-5 space-y-1 text-foreground">
                  {analysis.goals.map((g, i) => <li key={i}>{g}</li>)}
                </ul>
              </div>
            )}

            {analysis.causes && analysis.causes.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground">Causes</h4>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.causes.map((c, i) => <Badge key={i} variant="secondary">{c}</Badge>)}
                </div>
              </div>
            )}

            {analysis.notable_recipients && analysis.notable_recipients.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground">
                  {entityKind === 'committee' ? 'Notable spending / recipients' : 'Notable endorsements & coalitions'}
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  {analysis.notable_recipients.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}

            {analysis.key_people && analysis.key_people.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground">Key people</h4>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.key_people.map((p, i) => <Badge key={i} variant="outline">{p}</Badge>)}
                </div>
              </div>
            )}

            {analysis.controversies && analysis.controversies.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground">Controversies</h4>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  {analysis.controversies.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}

            {analysis.finance_claims && analysis.finance_claims.length > 0 && (
              <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                <h4 className="font-semibold text-foreground flex items-center gap-1.5 text-xs uppercase tracking-wide">
                  <Database className="h-3.5 w-3.5 text-primary" />
                  From finance signals
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-foreground">
                  {analysis.finance_claims.map((c, i) => <li key={i}>{c}</li>)}
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
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  No external sources cited. Treat this analysis as tentative.
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
