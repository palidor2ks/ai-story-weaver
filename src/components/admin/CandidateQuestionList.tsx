import { useState } from 'react';
import { useCandidateTopicQuestions, CandidateQuestionAnswer } from '@/hooks/useCandidateTopicQuestions';
import { usePopulateCandidateAnswers } from '@/hooks/usePopulateCandidateAnswers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, ChevronDown, ChevronUp, ExternalLink, Lightbulb } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { getSourceInfo, getSourceBadgeClass } from '@/lib/sourceUtils';
import { ScoreTextInline } from '@/components/ScoreText';

interface CandidateQuestionListProps {
  candidateId: string;
  candidateName: string;
  topicId: string;
  topicName: string;
}

function getConfidenceBadge(confidence: string | null) {
  switch (confidence) {
    case 'high': return { text: 'high', className: 'bg-green-100 text-green-700 border-green-200' };
    case 'medium': return { text: 'medium', className: 'bg-amber-100 text-amber-700 border-amber-200' };
    case 'low': return { text: 'low', className: 'bg-red-100 text-red-700 border-red-200' };
    default: return { text: '—', className: 'bg-muted text-muted-foreground' };
  }
}

function getEvidenceBadge(evidenceType: string | null) {
  switch (evidenceType) {
    case 'voting_record': return { text: 'Voting Record', className: 'bg-blue-100 text-blue-700 border-blue-200' };
    case 'public_statement': return { text: 'Public Statement', className: 'bg-green-100 text-green-700 border-green-200' };
    case 'inferred': return { text: 'AI Inferred', className: 'bg-amber-100 text-amber-700 border-amber-200' };
    case 'mixed': return { text: 'Mixed', className: 'bg-purple-100 text-purple-700 border-purple-200' };
    default: return { text: 'Web Research', className: 'bg-teal-100 text-teal-700 border-teal-200' };
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
  const confidenceBadge = getConfidenceBadge(question.confidence);
  const evidenceBadge = getEvidenceBadge(question.evidenceType);
  const isInferred = question.evidenceType === 'inferred';

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

            {/* Score - using ScoreTextInline for L/R format */}
            <div className="w-14 shrink-0">
              {question.answerValue !== null ? (
                <ScoreTextInline score={question.answerValue} />
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>

            {/* Confidence badge */}
            <Badge variant="outline" className={cn('text-xs px-1.5 py-0 shrink-0', confidenceBadge.className)}>
              {confidenceBadge.text}
            </Badge>

            {/* Evidence type badge */}
            {question.answerValue !== null && (
              <Badge variant="outline" className={cn('text-xs px-1.5 py-0 shrink-0', evidenceBadge.className)}>
                {evidenceBadge.text}
              </Badge>
            )}

            {/* Question text */}
            <span className="flex-1 truncate text-muted-foreground">
              {question.questionText}
            </span>

            {/* Regenerate button */}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 shrink-0"
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
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="text-muted-foreground">Score:</span>
              {question.answerValue !== null ? (
                <ScoreTextInline score={question.answerValue} />
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
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

            {/* AI Inference special handling - amber box */}
            {isInferred && question.sourceDescription && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-2">
                <div className="flex items-center gap-2 text-amber-700">
                  <Lightbulb className="h-4 w-4" />
                  <span className="text-xs font-medium">AI Logic</span>
                </div>
                <p className="text-sm text-amber-900 leading-relaxed">
                  {question.sourceDescription}
                </p>
                <p className="text-xs text-amber-600 italic">
                  This position was inferred based on general party ideology and typical policy patterns, 
                  as no specific documented stance was found.
                </p>
              </div>
            )}

            {/* Regular AI Response for non-inferred */}
            {!isInferred && question.sourceDescription && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">AI Response:</span>
                <p className="text-sm text-foreground/80 leading-relaxed">
                  {question.sourceDescription}
                </p>
              </div>
            )}

            {/* Source URLs - only for non-inferred answers */}
            {!isInferred && question.sourceUrls && question.sourceUrls.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {question.sourceUrls.map((url, idx) => {
                  const sourceTitle = question.sourceTitles?.[idx] || undefined;
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
