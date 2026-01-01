import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { usePartyTopicQuestions } from '@/hooks/usePartyTopicQuestions';
import { usePopulatePartyAnswers } from '@/hooks/usePopulatePartyAnswers';
import { ScoreTextInline } from '@/components/ScoreText';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { getSourceInfo, getSourceBadgeClass } from '@/lib/sourceUtils';

interface PartyQuestionListProps {
  partyId: string;
  topicId: string;
  isAnyLoading: boolean;
}

function getScoreLabel(value: number | null): string {
  if (value === null) return 'No answer';
  if (value <= -8) return 'Strong Progressive';
  if (value <= -4) return 'Progressive';
  if (value < 0) return 'Lean Progressive';
  if (value === 0) return 'Neutral / Centrist';
  if (value <= 3) return 'Lean Conservative';
  if (value <= 7) return 'Conservative';
  return 'Strong Conservative';
}

export function PartyQuestionList({ partyId, topicId, isAnyLoading }: PartyQuestionListProps) {
  const { data: questions, isLoading } = usePartyTopicQuestions(partyId, topicId, true);
  const { populatePartyQuestion, isQuestionLoading } = usePopulatePartyAnswers();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!questions || questions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">No questions found for this topic.</p>
    );
  }

  const getConfidenceBadge = (confidence: string | null) => {
    if (!confidence) return null;
    const colors: Record<string, string> = {
      high: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      low: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };
    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[confidence] || ''}`}>
        {confidence}
      </span>
    );
  };

  return (
    <div className="space-y-1 py-2">
      {questions.map((q) => {
        const loading = isQuestionLoading(partyId, q.questionId);
        const hasAnswer = q.answerValue !== null;
        const isExpanded = expandedId === q.questionId;
        
        return (
          <Collapsible
            key={q.questionId}
            open={isExpanded}
            onOpenChange={(open) => setExpandedId(open ? q.questionId : null)}
          >
            <div
              className={cn(
                "rounded-md bg-background/50 border border-border/50 transition-colors",
                isExpanded && "bg-muted/30"
              )}
            >
              <CollapsibleTrigger asChild>
                <div className="flex items-center gap-2 py-2 px-3 hover:bg-background/80 cursor-pointer text-sm">
                  {/* Expand indicator */}
                  <div className="w-4 shrink-0">
                    {isExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>

                  {/* Score */}
                  <div className="w-12 shrink-0 text-center">
                    {hasAnswer ? (
                      <Badge variant="outline" className="font-mono text-xs">
                        <ScoreTextInline score={q.answerValue!} />
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">—</Badge>
                    )}
                  </div>

                  {/* Confidence */}
                  <div className="w-14 shrink-0">
                    {getConfidenceBadge(q.confidence)}
                  </div>

                  {/* Source indicator */}
                  <div className="w-5 shrink-0">
                    {q.hasSource ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    ) : hasAnswer ? (
                      <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                    ) : null}
                  </div>

                  {/* Question text */}
                  <p className="flex-1 text-muted-foreground truncate" title={q.questionText}>
                    {q.questionText}
                  </p>

                  {/* Regenerate button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0"
                    disabled={loading || isAnyLoading}
                    onClick={(e) => {
                      e.stopPropagation();
                      populatePartyQuestion(partyId, q.questionId);
                    }}
                    title="Regenerate this answer"
                  >
                    {loading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="px-3 pb-3 pt-1 ml-4 border-l-2 border-border/50 space-y-2">
                  {/* Score with label */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Score:</span>
                    <Badge variant="outline" className="font-mono">
                      {hasAnswer ? <ScoreTextInline score={q.answerValue!} /> : '—'}
                    </Badge>
                    <span className="text-muted-foreground">
                      ({getScoreLabel(q.answerValue)})
                    </span>
                    {q.confidence && (
                      <>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-muted-foreground">Confidence:</span>
                        {getConfidenceBadge(q.confidence)}
                      </>
                    )}
                  </div>

                  {/* AI Explanation */}
                  {q.sourceDescription && (
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">AI Response:</span>
                      <p className="text-sm text-foreground/80 leading-relaxed">
                        {q.sourceDescription}
                      </p>
                    </div>
                  )}

                  {/* Source URLs */}
                  {q.sourceUrls && q.sourceUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {q.sourceUrls.map((url, idx) => {
                        const sourceTitle = q.sourceTitles?.[idx] || undefined;
                        const sourceInfo = getSourceInfo(url, sourceTitle);
                        return (
                          <a
                            key={idx}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              "inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border transition-colors hover:opacity-80",
                              getSourceBadgeClass(sourceInfo.type)
                            )}
                          >
                            <ExternalLink className="h-3 w-3" />
                            {sourceInfo.displayName}
                          </a>
                        );
                      })}
                    </div>
                  )}

                  {!q.sourceDescription && !hasAnswer && (
                    <p className="text-xs text-muted-foreground italic">
                      No AI response yet. Click regenerate to generate an answer.
                    </p>
                  )}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}
    </div>
  );
}