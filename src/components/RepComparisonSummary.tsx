import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronDown, ChevronUp, Sparkles, Check, X, ExternalLink, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Source {
  title: string;
  url: string;
  type: string;
}

interface RepComparisonSummaryProps {
  summary: string | null;
  deepAnalysis: string | null;
  keyAgreements: string[];
  keyDisagreements: string[];
  sources: Source[];
  isLoading: boolean;
  isGenerating: boolean;
  isStale: boolean;
  onDigDeeper: () => void;
  onRefresh: () => void;
  hasDeepAnalysis: boolean;
}

export function RepComparisonSummary({
  summary,
  deepAnalysis,
  keyAgreements,
  keyDisagreements,
  sources,
  isLoading,
  isGenerating,
  isStale,
  onDigDeeper,
  onRefresh,
  hasDeepAnalysis,
}: RepComparisonSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="mt-3 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  if (!summary && !isGenerating) {
    return (
      <div className="mt-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          className="text-xs text-muted-foreground hover:text-foreground gap-1"
        >
          <Sparkles className="h-3 w-3" />
          Generate AI Comparison
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {/* Summary */}
      <div className="flex items-start gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          {isGenerating ? (
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-2/3" />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {summary}
              {isStale && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRefresh}
                  className="ml-1 h-4 w-4 p-0 text-muted-foreground hover:text-foreground"
                  title="Comparison may be outdated"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Dig Deeper / Collapse Button */}
      {summary && !isGenerating && (
        <div className="flex items-center gap-2">
          {!hasDeepAnalysis ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDigDeeper}
              disabled={isGenerating}
              className="text-xs text-primary hover:text-primary/80 gap-1 h-6 px-2"
            >
              Dig Deeper
              <ChevronDown className="h-3 w-3" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-primary hover:text-primary/80 gap-1 h-6 px-2"
            >
              {isExpanded ? 'Show Less' : 'View Details'}
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          )}
        </div>
      )}

      {/* Expanded Deep Analysis */}
      {isExpanded && hasDeepAnalysis && (
        <div className="mt-3 pt-3 border-t border-border/50 space-y-3 animate-in slide-in-from-top-2 duration-200">
          {/* Deep Analysis Text */}
          {deepAnalysis && (
            <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {deepAnalysis}
            </div>
          )}

          {/* Agreements */}
          {keyAgreements.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400 mb-1">
                <Check className="h-3 w-3" />
                Agreements
              </div>
              <ul className="space-y-0.5">
                {keyAgreements.map((agreement, i) => (
                  <li key={i} className="text-xs text-muted-foreground pl-4">
                    • {agreement}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Disagreements */}
          {keyDisagreements.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                <X className="h-3 w-3" />
                Disagreements
              </div>
              <ul className="space-y-0.5">
                {keyDisagreements.map((disagreement, i) => (
                  <li key={i} className="text-xs text-muted-foreground pl-4">
                    • {disagreement}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Sources */}
          {sources.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Sources</div>
              <ul className="space-y-0.5">
                {sources.map((source, i) => (
                  <li key={i} className="text-xs">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      {source.title}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Loading state for deep analysis generation */}
      {isGenerating && hasDeepAnalysis && (
        <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      )}
    </div>
  );
}
