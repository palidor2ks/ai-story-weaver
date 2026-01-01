import { useState } from 'react';
import { useCandidateTopicQuestions, CandidateQuestionAnswer } from '@/hooks/useCandidateTopicQuestions';
import { usePopulateCandidateAnswers } from '@/hooks/usePopulateCandidateAnswers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, RefreshCw, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

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

function QuestionRow({ 
  question, 
  candidateId, 
  candidateName,
  isRegenerating,
  onRegenerate 
}: { 
  question: CandidateQuestionAnswer;
  candidateId: string;
  candidateName: string;
  isRegenerating: boolean;
  onRegenerate: () => void;
}) {
  const scoreBadge = getScoreBadge(question.answerValue);
  const confidenceBadge = getConfidenceBadge(question.confidence);

  return (
    <div className="flex items-center gap-2 py-2 px-3 hover:bg-muted/50 rounded-md text-sm">
      {/* Question text */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex-1 truncate cursor-help text-muted-foreground">
              {question.questionText}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-md">
            <p className="text-sm">{question.questionText}</p>
            {question.sourceDescription && (
              <p className="text-xs text-muted-foreground mt-1">
                Source: {question.sourceDescription}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Score badge */}
      <Badge variant="outline" className={cn('text-xs px-1.5 py-0', scoreBadge.className)}>
        {scoreBadge.text}
      </Badge>

      {/* Confidence badge */}
      <Badge variant="outline" className={cn('text-xs px-1.5 py-0', confidenceBadge.className)}>
        {confidenceBadge.text}
      </Badge>

      {/* Source indicator */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="w-4 h-4 flex items-center justify-center">
              {question.hasSource ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              ) : question.answerValue !== null ? (
                <XCircle className="h-3.5 w-3.5 text-red-500" />
              ) : (
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {question.hasSource ? 'Has source' : question.answerValue !== null ? 'No source' : 'No answer'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Regenerate button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={onRegenerate}
        disabled={isRegenerating}
      >
        {isRegenerating ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
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
      <div className="max-h-64 overflow-y-auto">
        {questions.map((question) => (
          <QuestionRow
            key={question.questionId}
            question={question}
            candidateId={candidateId}
            candidateName={candidateName}
            isRegenerating={isQuestionLoading(candidateId, question.questionId)}
            onRegenerate={() => handleRegenerate(question.questionId)}
          />
        ))}
      </div>
    </div>
  );
}
