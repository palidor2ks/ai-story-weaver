import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePopulateCandidateAnswers } from '@/hooks/usePopulateCandidateAnswers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, RefreshCw, CheckCircle2, XCircle, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CandidateAnswersPopoverProps {
  candidateId: string;
  candidateName: string;
}

interface TopicWithQuestions {
  topicId: string;
  topicName: string;
  icon: string;
  questions: QuestionAnswer[];
  answeredCount: number;
  sourcedCount: number;
}

interface QuestionAnswer {
  questionId: string;
  questionText: string;
  answerValue: number | null;
  confidence: string | null;
  sourceDescription: string | null;
  hasSource: boolean;
}

function getScoreBadge(value: number | null) {
  if (value === null) return { text: '—', className: 'bg-muted text-muted-foreground' };
  if (value < 0) return { text: `L${Math.abs(value)}`, className: 'bg-flag-blue text-white' };
  if (value > 0) return { text: `R${value}`, className: 'bg-flag-red text-white' };
  return { text: '0', className: 'bg-muted text-muted-foreground' };
}

function useCandidateAnswersByTopic(candidateId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['candidate-answers-by-topic', candidateId],
    queryFn: async (): Promise<TopicWithQuestions[]> => {
      // Fetch topics
      const { data: topics, error: topicsError } = await supabase
        .from('topics')
        .select('id, name, icon')
        .order('name');
      if (topicsError) throw topicsError;

      // Fetch all questions
      const { data: questions, error: questionsError } = await supabase
        .from('questions')
        .select('id, text, topic_id');
      if (questionsError) throw questionsError;

      // Fetch candidate's answers
      const { data: answers, error: answersError } = await supabase
        .from('candidate_answers')
        .select('question_id, answer_value, confidence, source_description')
        .eq('candidate_id', candidateId);
      if (answersError) throw answersError;

      const answerMap = new Map(
        (answers || []).map(a => [a.question_id, a])
      );

      // Group questions by topic
      return (topics || []).map(topic => {
        const topicQuestions = (questions || [])
          .filter(q => q.topic_id === topic.id)
          .map(q => {
            const answer = answerMap.get(q.id);
            const sourceDesc = answer?.source_description || '';
            const hasSource = sourceDesc.length > 0 && 
              !sourceDesc.toLowerCase().includes('no documented');
            
            return {
              questionId: q.id,
              questionText: q.text,
              answerValue: answer?.answer_value ?? null,
              confidence: answer?.confidence ?? null,
              sourceDescription: answer?.source_description ?? null,
              hasSource,
            };
          });

        const answeredCount = topicQuestions.filter(q => q.answerValue !== null).length;
        const sourcedCount = topicQuestions.filter(q => q.hasSource).length;

        return {
          topicId: topic.id,
          topicName: topic.name,
          icon: topic.icon,
          questions: topicQuestions,
          answeredCount,
          sourcedCount,
        };
      }).filter(t => t.questions.length > 0);
    },
    enabled,
    staleTime: 30000,
  });
}

function QuestionRow({ 
  question, 
  candidateId, 
  candidateName,
  isRegenerating,
  onRegenerate 
}: { 
  question: QuestionAnswer;
  candidateId: string;
  candidateName: string;
  isRegenerating: boolean;
  onRegenerate: () => void;
}) {
  const scoreBadge = getScoreBadge(question.answerValue);

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted/50 rounded text-xs">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex-1 truncate cursor-help text-muted-foreground">
              {question.questionText.slice(0, 50)}...
            </span>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs">
            <p className="text-xs">{question.questionText}</p>
            {question.sourceDescription && (
              <p className="text-xs text-muted-foreground mt-1 italic">
                {question.sourceDescription}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Badge variant="outline" className={cn('text-[10px] px-1 py-0', scoreBadge.className)}>
        {scoreBadge.text}
      </Badge>

      {question.hasSource ? (
        <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
      ) : question.answerValue !== null ? (
        <XCircle className="h-3 w-3 text-red-500 shrink-0" />
      ) : (
        <div className="w-3 h-3" />
      )}

      <Button
        variant="ghost"
        size="sm"
        className="h-5 w-5 p-0"
        onClick={(e) => {
          e.stopPropagation();
          onRegenerate();
        }}
        disabled={isRegenerating}
      >
        {isRegenerating ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <RefreshCw className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}

export function CandidateAnswersPopover({ candidateId, candidateName }: CandidateAnswersPopoverProps) {
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const { data: topics, isLoading } = useCandidateAnswersByTopic(candidateId, true);
  const { populateCandidateQuestion, isQuestionLoading } = usePopulateCandidateAnswers();

  const toggleTopic = (topicId: string) => {
    setExpandedTopics(prev => {
      const next = new Set(prev);
      if (next.has(topicId)) {
        next.delete(topicId);
      } else {
        next.add(topicId);
      }
      return next;
    });
  };

  const handleRegenerate = async (questionId: string) => {
    await populateCandidateQuestion(candidateId, questionId, candidateName);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm text-muted-foreground">Loading answers...</span>
      </div>
    );
  }

  if (!topics || topics.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground">
        No questions found
      </div>
    );
  }

  const totalAnswered = topics.reduce((sum, t) => sum + t.answeredCount, 0);
  const totalQuestions = topics.reduce((sum, t) => sum + t.questions.length, 0);
  const totalSourced = topics.reduce((sum, t) => sum + t.sourcedCount, 0);

  return (
    <div className="w-80">
      <div className="px-3 py-2 border-b">
        <h4 className="font-medium text-sm">{candidateName}</h4>
        <p className="text-xs text-muted-foreground">
          {totalAnswered}/{totalQuestions} answered · {totalSourced} sourced
        </p>
      </div>
      <ScrollArea className="h-72">
        <div className="p-2 space-y-1">
          {topics.map(topic => (
            <Collapsible
              key={topic.topicId}
              open={expandedTopics.has(topic.topicId)}
              onOpenChange={() => toggleTopic(topic.topicId)}
            >
              <CollapsibleTrigger className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-muted/50 rounded text-sm">
                <span>{topic.icon}</span>
                <span className="flex-1 text-left truncate">{topic.topicName}</span>
                <span className="text-xs text-muted-foreground">
                  {topic.answeredCount}/{topic.questions.length}
                </span>
                <ChevronDown className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  expandedTopics.has(topic.topicId) && "rotate-180"
                )} />
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-6 pr-1">
                {topic.questions.map(question => (
                  <QuestionRow
                    key={question.questionId}
                    question={question}
                    candidateId={candidateId}
                    candidateName={candidateName}
                    isRegenerating={isQuestionLoading(candidateId, question.questionId)}
                    onRegenerate={() => handleRegenerate(question.questionId)}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
