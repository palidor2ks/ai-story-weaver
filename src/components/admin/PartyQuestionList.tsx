import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { usePartyTopicQuestions } from '@/hooks/usePartyTopicQuestions';
import { usePopulatePartyAnswers } from '@/hooks/usePopulatePartyAnswers';
import { ScoreTextInline } from '@/components/ScoreText';

interface PartyQuestionListProps {
  partyId: string;
  topicId: string;
  isAnyLoading: boolean;
}

export function PartyQuestionList({ partyId, topicId, isAnyLoading }: PartyQuestionListProps) {
  const { data: questions, isLoading } = usePartyTopicQuestions(partyId, topicId, true);
  const { populatePartyQuestion, isQuestionLoading } = usePopulatePartyAnswers();

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
        
        return (
          <div
            key={q.questionId}
            className="flex items-center gap-2 py-2 px-3 rounded-md bg-background/50 hover:bg-background/80 transition-colors text-sm border border-border/50"
          >
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
              onClick={() => populatePartyQuestion(partyId, q.questionId)}
              title="Regenerate this answer"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
