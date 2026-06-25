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
import { Loader2, ExternalLink, AlertTriangle, Database, Globe, BookOpen, RefreshCw, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ShareAIAnalysisButton } from '@/components/ShareAIAnalysisButton';

export interface RelatedEntity {
  name: string;
  fec_id: string | null;
  relationship: string;
  evidence: string;
  citation: string | null;
}

export interface RecipientAnalysis {
  summary: string;
  analysis: string;
  positions?: { topic: string; stance: string }[];
  goals?: string[];
  key_people?: string[];
  notable_recipients?: string[];
  controversies?: string[];
  causes?: string[];
  related_entities?: RelatedEntity[];
  finance_claims?: string[];
  public_context_claims?: string[];
  insufficient_information: boolean;
  confidence?: number;
  confidence_rationale?: string;
  data_coverage?: 'none' | 'sparse' | 'moderate' | 'rich';
  sources: { title: string; url: string }[];
  provider?: string;
  provider_errors?: { provider: string; status: number; code: string }[];
  aliased_fec_ids?: string[];
  alias_canonical_name?: string | null;
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

export const normalizeInvokeError = (raw: unknown): string => {
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

  const fetchAnalysis = async (force = false) => {
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
          force_refresh: force,
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

  const displayName = analysis?.alias_canonical_name || entityName;
  const subtitle = [office, party, state].filter(Boolean).join(' · ');

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
              AI Analysis
            </p>
            <DialogTitle className="text-xl font-black text-white leading-tight">
              {displayName}
            </DialogTitle>
            {subtitle && (
              <DialogDescription className="text-sm text-white/60 mt-0.5">
                {subtitle}
              </DialogDescription>
            )}
            {analysis?.aliased_fec_ids && analysis.aliased_fec_ids.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-2">
                <span className="font-mono-label text-xs font-bold text-white/50 uppercase tracking-widest">
                  Combined across:
                </span>
                {analysis.aliased_fec_ids.map((id) => (
                  <span key={id} className="font-mono-label text-xs bg-poli-navy/10 text-white/80 px-2 py-0.5 rounded-full border border-white/20">
                    {id}
                  </span>
                ))}
              </div>
            )}
          </div>
          {analysis && !isLoading && (
            <div className="flex flex-wrap items-center gap-2 pt-3">
              {!analysis.insufficient_information && (
                <ShareAIAnalysisButton
                  subjectName={displayName}
                  subtitle={entityKind === 'committee' ? 'Committee Analysis' : 'Candidate Analysis'}
                  subjectKind={entityKind}
                  summary={analysis.summary}
                  confidence={analysis.confidence}
                  dataCoverage={analysis.data_coverage}
                  causes={analysis.causes}
                  profileUrl={
                    typeof window !== 'undefined'
                      ? `${window.location.origin}/${entityKind === 'committee' ? 'committee' : 'candidate'}/${entityId}`
                      : undefined
                  }
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
              <span>Searching the web and generating analysis…</span>
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
                  <span>Insufficient public information to confidently identify this entity. Treat the analysis below as tentative.</span>
                </div>
              )}

              {(typeof analysis.confidence === 'number' || analysis.data_coverage) && (
                <div className="bg-white rounded-xl p-4 mb-3 shadow-sm space-y-2">
                  <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-2">
                    Data quality
                  </p>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    {analysis.data_coverage && (() => {
                      const cfg = {
                        none: { label: 'No filings', tone: 'bg-destructive/15 text-destructive border-destructive/30' },
                        sparse: { label: 'Sparse filings', tone: 'bg-amber-500/15 text-amber-700 border-amber-500/30' },
                        moderate: { label: 'Moderate filings', tone: 'bg-blue-500/15 text-blue-700 border-blue-500/30' },
                        rich: { label: 'Rich filings', tone: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' },
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
                          <span className="text-xs font-medium text-poli-muted whitespace-nowrap">Confidence</span>
                          <div className="flex-1 h-1.5 rounded-full bg-poli-surface overflow-hidden">
                            <div className={`h-full ${tone}`} style={{ width: `${c}%` }} />
                          </div>
                          <span className="text-xs font-semibold tabular-nums">{c}/100 · {label}</span>
                        </div>
                      );
                    })()}
                  </div>
                  {analysis.confidence_rationale && (
                    <p className="text-xs text-poli-muted italic">{analysis.confidence_rationale}</p>
                  )}
                </div>
              )}

              <div className="bg-white rounded-xl p-4 mb-3 shadow-sm">
                <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-2">
                  Summary
                </p>
                <p className="text-poli-body leading-relaxed">{analysis.summary}</p>
              </div>

              {analysis.positions && analysis.positions.length > 0 && (
                <div className="bg-white rounded-xl p-4 mb-3 shadow-sm">
                  <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-2">
                    Positions
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

              {analysis.goals && analysis.goals.length > 0 && (
                <div className="bg-white rounded-xl p-4 mb-3 shadow-sm">
                  <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-2">
                    Goals
                  </p>
                  <p className="text-poli-body leading-relaxed">{toOneSentence(analysis.goals)}</p>
                </div>
              )}

              {analysis.causes && analysis.causes.length > 0 && (
                <div className="bg-white rounded-xl p-4 mb-3 shadow-sm">
                  <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-2">
                    Causes
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.causes.map((c, i) => (
                      <span key={i} className="font-mono-label text-xs bg-poli-navy/10 text-poli-navy px-2 py-0.5 rounded-full">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {analysis.notable_recipients && analysis.notable_recipients.length > 0 && (
                <div className="bg-white rounded-xl p-4 mb-3 shadow-sm">
                  <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-2">
                    {entityKind === 'committee' ? 'Notable spending / recipients' : 'Notable endorsements & coalitions'}
                  </p>
                  <p className="text-poli-body leading-relaxed">{toOneSentence(analysis.notable_recipients)}</p>
                </div>
              )}

              {analysis.key_people && analysis.key_people.length > 0 && (
                <div className="bg-white rounded-xl p-4 mb-3 shadow-sm">
                  <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-2">
                    Key people
                  </p>
                  <p className="text-poli-body leading-relaxed">{toOneSentence(analysis.key_people)}</p>
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

              {analysis.related_entities && analysis.related_entities.length > 0 && (
                <div className="bg-white rounded-xl p-4 mb-3 shadow-sm border border-amber-500/30">
                  <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    Possibly related committees
                  </p>
                  <p className="text-xs text-poli-muted italic mb-2">
                    These share a similar name but are separate FEC registrations. If you believe any of these are the same organization, an admin can link them as an alias to combine the analysis.
                  </p>
                  <ul className="space-y-2">
                    {analysis.related_entities.map((r, i) => (
                      <li key={i} className="text-sm">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-poli-body">{r.name || 'Unknown'}</span>
                          {r.fec_id && (
                            <span className="font-mono-label text-xs bg-poli-navy/10 text-poli-navy px-2 py-0.5 rounded-full">
                              {r.fec_id}
                            </span>
                          )}
                          <Badge variant="secondary" className="text-[10px]">{r.relationship.replace(/_/g, ' ')}</Badge>
                        </div>
                        {r.evidence && <p className="text-xs text-poli-muted mt-0.5">{r.evidence}</p>}
                        {r.citation && (
                          <a href={r.citation} target="_blank" rel="noopener noreferrer" className="text-xs text-poli-navy hover:underline inline-flex items-center gap-1 mt-0.5">
                            <ExternalLink className="h-3 w-3" /> source
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.finance_claims && analysis.finance_claims.length > 0 && (
                <div className="bg-white rounded-xl p-4 mb-3 shadow-sm">
                  <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <Database className="h-3.5 w-3.5" />
                    From finance signals
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-poli-body">
                    {analysis.finance_claims.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
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
                      : "No external sources cited. Treat this analysis as tentative."}
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
