import { Question, QuestionOption } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface QuizQuestionProps {
  question: Question;
  selectedOptionId: string | null;
  onSelect: (option: QuestionOption) => void;
  onSkip?: () => void;
  questionNumber: number;
  totalQuestions: number;
}

export const QuizQuestion = ({
  question,
  selectedOptionId,
  onSelect,
  onSkip,
  questionNumber,
  totalQuestions,
}: QuizQuestionProps) => {
  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <span className="text-sm font-medium text-muted-foreground">
          Question {questionNumber} of {totalQuestions}
        </span>
        <div className="flex-1 mx-4 h-2 bg-secondary rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-hero transition-all duration-500 ease-out"
            style={{ width: `${(questionNumber / totalQuestions) * 100}%` }}
          />
        </div>
      </div>

      <Card className="bg-card border-border shadow-elevated">
        <CardContent className="p-6 md:p-8">
          <h2 className="font-display text-xl md:text-2xl font-semibold text-foreground mb-8 leading-relaxed">
            {question.text}
          </h2>

          <div className="space-y-3">
            {question.options.map((option, index) => {
              const isSelected = selectedOptionId === option.id;
              
              return (
                <Button
                  key={option.id}
                  variant={isSelected ? "default" : "outline"}
                  onClick={() => onSelect(option)}
                  className={cn(
                    "w-full justify-start text-left h-auto py-4 px-5 transition-all duration-200",
                    isSelected && "ring-2 ring-accent ring-offset-2",
                    "animate-slide-up"
                  )}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <span className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold mr-4 flex-shrink-0",
                    isSelected ? "bg-primary-foreground text-primary" : "bg-secondary text-muted-foreground"
                  )}>
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="text-base break-words whitespace-normal text-wrap">{option.text}</span>
                </Button>
              );
            })}
          </div>

          {/* Not Important option */}
          {onSkip && (
            <div className="mt-6 pt-4 border-t border-border">
              <Button
                variant="ghost"
                onClick={onSkip}
                className="w-full text-muted-foreground hover:text-foreground gap-2"
              >
                <X className="w-4 h-4" />
                Not Important to Me - Skip This Topic
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
