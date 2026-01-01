import { useState } from 'react';
import { useCandidateTopicQuestions, CandidateQuestionAnswer } from '@/hooks/useCandidateTopicQuestions';
import { usePopulateCandidateAnswers } from '@/hooks/usePopulateCandidateAnswers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, CheckCircle2, XCircle, HelpCircle, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { getSourceInfo, getSourceBadgeClass } from '@/lib/sourceUtils';

interface CandidateQuestionListProps {
  candidateId: string;
  candidateName: string;
  topicId: string;
  topicName: string;
}

function getScoreBadge(value: number | null) {
  if (value === null) return { text: '—', className: 'bg-muted text-muted-foreground' };
  if (value < 0) return { text: `L${Math.abs(value)}`, className: 'bg-flag-blue text-white' };
  if (value > 0) return { text: `R${value}`, className: 'bg-flag-red text-white' };
  return { text: '0', className: 'bg-muted text-muted-foreground' };
}

function getConfidenceBadge(confidence: string | null) {
  switch (confidence) {
    case 'high': return { text: 'high', className: 'bg-green-600 text-white' };
    case 'medium': return { text: 'med', className: 'bg-amber-500 text-white' };
    case 'low': return { text: 'low', className: 'bg-red-500 text-white' };
    default: return { text: '—', className: 'bg-muted text-muted-foreground' };
  }
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

function QuestionRow({ 
  question, 
  candidateId, 
  candidateName,
  isRegenerating,
  isExpanded,
  onToggle,
  onRegenerate 
}: { 
  question: CandidateQuestionAnswer;
  candidateId: string;
  candidateName: string;
  isRegenerating: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onRegenerate: () => void;
}) {
  const scoreBadge = getScoreBadge(question.answerValue);
  const confidenceBadge = getConfidenceBadge(question.confidence);

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div className={cn(
        "rounded-md border border-border/50 transition-colors",
        isExpanded && "bg-muted/30"
      )}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-2 py-2 px-3 hover:bg-muted/50 cursor-pointer text-sm">
            {/* Expand indicator */}
            <div className="w-4 shrink-0">
              {isExpanded ? (
                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>

            {/* Question text */}
            <span className="flex-1 truncate text-muted-foreground">
              {question.questionText}
            </span>

            {/* Score badge */}
            <Badge variant="outline" className={cn('text-xs px-1.5 py-0', scoreBadge.className)}>
              {scoreBadge.text}
            </Badge>

            {/* Confidence badge */}
            <Badge variant="outline" className={cn('text-xs px-1.5 py-0', confidenceBadge.className)}>
              {confidenceBadge.text}
            </Badge>

            {/* Source indicator */}
            <div className="w-4 h-4 flex items-center justify-center">
              {question.hasSource ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              ) : question.answerValue !== null ? (
                <XCircle className="h-3.5 w-3.5 text-red-500" />
              ) : (
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>

            {/* Regenerate button */}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onRegenerate();
              }}
              disabled={isRegenerating}
            >
              {isRegenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 pt-1 ml-4 border-l-2 border-border/50 space-y-2">
            {/* Score with label */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Score:</span>
              <Badge variant="outline" className={cn('font-mono', scoreBadge.className)}>
                {scoreBadge.text}
              </Badge>
              <span className="text-muted-foreground">
                ({getScoreLabel(question.answerValue)})
              </span>
              {question.confidence && (
                <>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground">Confidence:</span>
                  <Badge variant="outline" className={cn('text-xs px-1.5 py-0', confidenceBadge.className)}>
                    {confidenceBadge.text}
                  </Badge>
                </>
              )}
            </div>

            {/* AI Explanation */}
            {question.sourceDescription && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">AI Response:</span>
                <p className="text-sm text-foreground/80 leading-relaxed">
                  {question.sourceDescription}
                </p>
              </div>
            )}

            {/* Source URLs */}
            {question.sourceUrls && question.sourceUrls.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {question.sourceUrls.map((url, idx) => {
                  const sourceInfo = getSourceInfo(url);
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

            {!question.sourceDescription && question.answerValue === null && (
              <p className="text-xs text-muted-foreground italic">
                No AI response yet. Click regenerate to generate an answer.
              </p>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function CandidateQuestionList({ 
  candidateId, 
  candidateName,
  topicId, 
  topicName 
}: CandidateQuestionListProps) {
  const { data: questions, isLoading } = useCandidateTopicQuestions(candidateId, topicId, true);
  const { populateCandidateQuestion, isQuestionLoading } = usePopulateCandidateAnswers();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleRegenerate = async (questionId: string) => {
    await populateCandidateQuestion(candidateId, questionId, candidateName);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        <span className="text-sm text-muted-foreground">Loading questions...</span>
      </div>
    );
  }

  if (!questions || questions.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground">
        No questions found for this topic
      </div>
    );
  }

  const answeredCount = questions.filter(q => q.answerValue !== null).length;
  const sourcedCount = questions.filter(q => q.hasSource).length;

  return (
    <div className="border-t border-border/50 mt-2 pt-2">
      <div className="flex items-center gap-2 px-3 pb-2 text-xs text-muted-foreground">
        <span>{topicName}</span>
        <span>•</span>
        <span>{answeredCount}/{questions.length} answered</span>
        <span>•</span>
        <span>{sourcedCount}/{answeredCount || 1} sourced</span>
      </div>
      <div className="max-h-80 overflow-y-auto space-y-1">
        {questions.map((question) => (
          <QuestionRow
            key={question.questionId}
            question={question}
            candidateId={candidateId}
            candidateName={candidateName}
            isRegenerating={isQuestionLoading(candidateId, question.questionId)}
            isExpanded={expandedId === question.questionId}
            onToggle={() => setExpandedId(expandedId === question.questionId ? null : question.questionId)}
            onRegenerate={() => handleRegenerate(question.questionId)}
          />
        ))}
      </div>
    </div>
  );
}