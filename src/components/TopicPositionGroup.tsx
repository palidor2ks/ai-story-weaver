import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CompactPositionRow } from './CompactPositionRow';
import { CandidateAnswer } from '@/hooks/useCandidateAnswers';
import { cn } from '@/lib/utils';

interface TopicPositionGroupProps {
  topicName: string;
  topicIcon?: string;
  answers: CandidateAnswer[];
  userAnswerMap: Map<string, { value: number; text: string | null }>;
  defaultOpen?: boolean;
}

export const TopicPositionGroup = ({ 
  topicName, 
  topicIcon,
  answers, 
  userAnswerMap,
  defaultOpen = false 
}: TopicPositionGroupProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);
  
  const INITIAL_SHOW_COUNT = 4;

  // Calculate agreement stats
  const stats = answers.reduce((acc, answer) => {
    const userAnswer = userAnswerMap.get(answer.question_id);
    if (userAnswer !== undefined) {
      acc.hasUserAnswers++;
      const difference = Math.abs(answer.answer_value - userAnswer.value);
      const sameSign = answer.answer_value * userAnswer.value > 0;
      
      if (difference <= 4 && (sameSign || Math.abs(answer.answer_value) <= 2)) {
        acc.agreements++;
      } else if (difference >= 10 || (answer.answer_value * userAnswer.value < 0 && Math.abs(answer.answer_value) > 4)) {
        acc.disagreements++;
      }
    }
    return acc;
  }, { agreements: 0, disagreements: 0, hasUserAnswers: 0 });

  // Calculate average score for topic
  const avgScore = answers.reduce((sum, a) => sum + a.answer_value, 0) / answers.length;
  
  const getScoreLabel = (value: number) => {
    if (value >= 5) return { label: 'Conservative', className: 'text-red-600' };
    if (value <= -5) return { label: 'Progressive', className: 'text-blue-600' };
    return { label: 'Mixed', className: 'text-purple-600' };
  };

  const scoreInfo = getScoreLabel(avgScore);
  const displayedAnswers = showAll ? answers : answers.slice(0, INITIAL_SHOW_COUNT);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border border-border rounded-lg">
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-3 p-3 hover:bg-secondary/30 transition-colors rounded-lg text-left">
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )}
          
          {/* Topic name and icon */}
          <div className="flex items-center gap-2 min-w-0">
            {topicIcon && <span className="text-lg">{topicIcon}</span>}
            <span className="font-medium text-foreground">{topicName}</span>
          </div>

          {/* Count */}
          <Badge variant="secondary" className="text-xs flex-shrink-0">
            {answers.length}
          </Badge>

          {/* Score tendency */}
          <span className={cn("text-xs flex-shrink-0 hidden sm:inline", scoreInfo.className)}>
            {scoreInfo.label}
          </span>

          {/* Agreement stats */}
          <div className="flex items-center gap-1 ml-auto flex-shrink-0">
            {stats.agreements > 0 && (
              <Badge variant="outline" className="bg-agree/10 text-agree border-agree/30 text-xs">
                {stats.agreements} agree
              </Badge>
            )}
            {stats.disagreements > 0 && (
              <Badge variant="outline" className="bg-disagree/10 text-disagree border-disagree/30 text-xs">
                {stats.disagreements} diff
              </Badge>
            )}
          </div>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="px-2 pb-2 space-y-1">
          {displayedAnswers.map(answer => {
            const userData = userAnswerMap.get(answer.question_id);
            return (
              <CompactPositionRow
                key={answer.id}
                answer={answer}
                userAnswer={userData?.value ?? null}
                userAnswerText={userData?.text ?? null}
              />
            );
          })}

          {answers.length > INITIAL_SHOW_COUNT && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                setShowAll(!showAll);
              }}
            >
              {showAll ? 'Show less' : `Show all ${answers.length} positions`}
            </Button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
