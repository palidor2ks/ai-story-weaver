import { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { Sparkles, Loader2, ExternalLink, AlertTriangle, Database, Globe, BookOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export interface DonorAnalysis {
  summary: string;
  analysis: string;
  party_support: { party: string; amount: number; share: number }[];
  causes: string[];
  motivation_hypotheses: string[];
  finance_claims?: string[];
  public_context_claims?: string[];
  insufficient_information: boolean;
  sources: { title: string; url: string }[];
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

export const DonorAIAnalysisDialog = ({ id, name, type, cycle, profileHref, trigger }: Props) => {
  const [analysis, setAnalysis] = useState<DonorAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = async () => {
    setIsLoading(true);
    setError(null);

    const invokeOnce = () => supabase.functions.invoke('ai-donor-analysis', {
      body: { donor_id: id, donor_name: name, donor_type: type, cycle },
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
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {name}
          </DialogTitle>
          <DialogDescription>
            AI-generated donor analysis grounded in campaign-finance data and broader public context.
          </DialogDescription>
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

            {analysis.motivation_hypotheses?.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground">Possible motivations</h4>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  {analysis.motivation_hypotheses.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.analysis && (
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground">Deeper analysis</h4>
                <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">{analysis.analysis}</p>
              </div>
            )}

            {analysis.sources?.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <h4 className="font-semibold text-foreground">Sources</h4>
                <ul className="space-y-1">
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
                </ul>
              </div>
            )}

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
