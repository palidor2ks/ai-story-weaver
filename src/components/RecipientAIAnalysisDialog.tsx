import { ReactNode, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Sparkles, Loader2, ExternalLink, AlertTriangle, Globe, Database, BookOpen, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export interface RecipientAnalysis {
  summary: string;
  analysis: string;
  positions: { topic: string; stance: string; evidence?: string }[];
  policy_priorities: string[];
  goals: string[];
  top_donor_categories: string[];
  coalition_signals: string[];
  finance_claims: string[];
  public_context_claims: string[];
  controversies: string[];
  insufficient_information: boolean;
  confidence?: number;
  confidence_rationale?: string;
  sources: { title: string; url: string }[];
  provider?: 'perplexity' | 'gemini';
  provider_fallback?: { reason: string | null } | null;
  display_name?: string;
}

interface Props {
  entityType: 'candidate' | 'committee';
  entityId: string;
  displayName: string;
  cycle?: string;
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

export const RecipientAIAnalysisDialog = ({ entityType, entityId, displayName, cycle, trigger }: Props) => {
  const [analysis, setAnalysis] = useState<RecipientAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-recipient-analysis', {
        body: { entity_type: entityType, entity_id: entityId, cycle },
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
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5 min-w-0">
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                {displayName}
              </DialogTitle>
              <DialogDescription>
                AI analysis of {entityType === 'candidate' ? 'this candidate' : 'this committee'}'s positions, priorities, and goals.
              </DialogDescription>
            </div>
            {analysis && !isLoading && (
              <Button size="sm" variant="outline" onClick={fetchAnalysis} className="shrink-0">
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Regenerate
              </Button>
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
            {analysis.provider && (
              <div className="flex items-center gap-2 text-xs">
                <Badge variant={analysis.provider === 'perplexity' ? 'default' : 'secondary'} className="gap-1">
                  <Globe className="h-3 w-3" />
                  {analysis.provider === 'perplexity' ? 'Web-grounded (Perplexity)' : 'AI fallback (Gemini)'}
                </Badge>
                {analysis.provider === 'gemini' && (
                  <span className="text-muted-foreground italic">Web search unavailable — using model knowledge</span>
                )}
              </div>
            )}

            {analysis.insufficient_information && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Could not uniquely identify this entity from the available signals. Treat the analysis as tentative.</span>
              </div>
            )}

            {typeof analysis.confidence === 'number' && (() => {
              const c = Math.max(0, Math.min(100, Math.round(analysis.confidence)));
              const tone = c >= 70 ? 'bg-emerald-500' : c >= 40 ? 'bg-amber-500' : 'bg-destructive';
              const label = c >= 70 ? 'High' : c >= 40 ? 'Medium' : 'Low';
              return (
                <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Confidence</span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full ${tone}`} style={{ width: `${c}%` }} />
                    </div>
                    <span className="text-xs font-semibold tabular-nums">{c}/100 · {label}</span>
                  </div>
                  {analysis.confidence_rationale && (
                    <p className="text-xs text-muted-foreground italic">{analysis.confidence_rationale}</p>
                  )}
                </div>
              );
            })()}

            <p className="text-foreground leading-relaxed">{analysis.summary}</p>

            {analysis.positions?.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground">Positions</h4>
                <ul className="space-y-2">
                  {analysis.positions.map((p, i) => (
                    <li key={i} className="rounded-md border border-border p-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-medium text-foreground">{p.topic}</span>
                        <Badge variant="outline" className="text-xs">{p.stance}</Badge>
                      </div>
                      {p.evidence && <p className="text-xs text-muted-foreground">{p.evidence}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.policy_priorities?.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground">Policy priorities</h4>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.policy_priorities.map((c, i) => <Badge key={i} variant="secondary">{c}</Badge>)}
                </div>
              </div>
            )}

            {analysis.goals?.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground">Apparent goals</h4>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  {analysis.goals.map((g, i) => <li key={i}>{g}</li>)}
                </ul>
              </div>
            )}

            {analysis.top_donor_categories?.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground">Donor base signals</h4>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.top_donor_categories.map((c, i) => <Badge key={i} variant="outline">{c}</Badge>)}
                </div>
              </div>
            )}

            {analysis.coalition_signals?.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground">Coalition signals</h4>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  {analysis.coalition_signals.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}

            {analysis.finance_claims?.length > 0 && (
              <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                <h4 className="font-semibold text-foreground flex items-center gap-1.5 text-xs uppercase tracking-wide">
                  <Database className="h-3.5 w-3.5 text-primary" /> From finance signals
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-foreground">
                  {analysis.finance_claims.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}

            {analysis.public_context_claims?.length > 0 && (
              <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                <h4 className="font-semibold text-foreground flex items-center gap-1.5 text-xs uppercase tracking-wide">
                  <Globe className="h-3.5 w-3.5 text-primary" /> From public context
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-foreground">
                  {analysis.public_context_claims.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}

            {analysis.controversies?.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground">Controversies / criticism</h4>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  {analysis.controversies.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
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
                <BookOpen className="h-4 w-4 text-primary" /> Sources & citations
              </h4>
              {analysis.sources?.length > 0 ? (
                <ol className="space-y-1 list-decimal pl-5">
                  {analysis.sources.map((s, i) => (
                    <li key={i}>
                      <a href={s.url} target="_blank" rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" />{s.title}
                      </a>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  No external sources cited. Verify public-context claims independently.
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
