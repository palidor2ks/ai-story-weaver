import { ExternalLink, FileText, Mic, Globe, Vote, ScrollText, HelpCircle, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CandidateAnswer, getSourceTypeLabel } from '@/hooks/useCandidateAnswers';
import { cn } from '@/lib/utils';

interface CandidateAnswerCardProps {
  answer: CandidateAnswer;
  userAnswer?: number | null;
  showQuestion?: boolean;
}

export const CandidateAnswerCard = ({ 
  answer, 
  userAnswer, 
  showQuestion = true 
}: CandidateAnswerCardProps) => {
  const getSourceIcon = (sourceType: CandidateAnswer['source_type']) => {
    switch (sourceType) {
      case 'voting_record': return Vote;
      case 'public_statement': return Mic;
      case 'campaign_website': return Globe;
      case 'interview': return Mic;
      case 'legislation': return ScrollText;
      case 'other': return FileText;
      default: return HelpCircle;
    }
  };

  const getConfidenceIcon = (confidence: CandidateAnswer['confidence']) => {
    switch (confidence) {
      case 'high': return { icon: ShieldCheck, color: 'text-green-500', label: 'High confidence - verified source' };
      case 'medium': return { icon: Shield, color: 'text-amber-500', label: 'Medium confidence - likely accurate' };
      case 'low': return { icon: ShieldAlert, color: 'text-red-400', label: 'Low confidence - needs verification' };
    }
  };

  const getScoreColor = (value: number) => {
    if (value >= 5) return 'text-blue-600 bg-blue-500/10';
    if (value <= -5) return 'text-red-600 bg-red-500/10';
    return 'text-muted-foreground bg-muted';
  };

  const getScoreLabel = (value: number) => {
    if (value >= 7) return 'Strongly Progressive';
    if (value >= 3) return 'Progressive';
    if (value >= 1) return 'Lean Progressive';
    if (value <= -7) return 'Strongly Conservative';
    if (value <= -3) return 'Conservative';
    if (value <= -1) return 'Lean Conservative';
    return 'Moderate';
  };

  const getAgreementBadge = () => {
    if (userAnswer === null || userAnswer === undefined) return null;
    
    const difference = Math.abs(answer.answer_value - userAnswer);
    const sameSign = answer.answer_value * userAnswer > 0;
    
    if (difference <= 4 && (sameSign || Math.abs(answer.answer_value) <= 2)) {
      return <Badge className="bg-agree/20 text-agree border-agree/30">You Agree</Badge>;
    }
    if (difference >= 10 || (answer.answer_value * userAnswer < 0 && Math.abs(answer.answer_value) > 4)) {
      return <Badge className="bg-disagree/20 text-disagree border-disagree/30">You Disagree</Badge>;
    }
    return <Badge variant="outline" className="text-muted-foreground">Mixed</Badge>;
  };

  const SourceIcon = getSourceIcon(answer.source_type);
  const confidenceInfo = getConfidenceIcon(answer.confidence);

  return (
    <TooltipProvider>
      <Card className="border-border hover:border-primary/30 transition-colors">
        <CardContent className="p-4">
          {/* Question */}
          {showQuestion && answer.question && (
            <div className="mb-3">
              <Badge variant="secondary" className="mb-2 text-xs">
                {answer.question.topics?.name || 'General'}
              </Badge>
              <p className="text-sm font-medium text-foreground">{answer.question.text}</p>
            </div>
          )}

          {/* Answer Value */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-lg font-bold px-2 py-1 rounded",
                getScoreColor(answer.answer_value)
              )}>
                {answer.answer_value > 0 ? '+' : ''}{answer.answer_value}
              </span>
              <span className="text-sm text-muted-foreground">{getScoreLabel(answer.answer_value)}</span>
            </div>
            {getAgreementBadge()}
          </div>

          {/* Source Information */}
          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-secondary/30 border border-border/50">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <SourceIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-foreground block">
                  {getSourceTypeLabel(answer.source_type)}
                </span>
                {answer.source_description && (
                  <span className="text-xs text-muted-foreground truncate block">
                    {answer.source_description}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Confidence indicator */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <confidenceInfo.icon className={cn("w-4 h-4", confidenceInfo.color)} />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {confidenceInfo.label}
                </TooltipContent>
              </Tooltip>

              {/* Source link */}
              {answer.source_url && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  asChild
                >
                  <a 
                    href={answer.source_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </Button>
              )}
            </div>
          </div>

          {/* User comparison */}
          {userAnswer !== null && userAnswer !== undefined && (
            <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Your answer:</span>
              <span className={cn(
                "font-medium px-1.5 py-0.5 rounded",
                getScoreColor(userAnswer)
              )}>
                {userAnswer > 0 ? '+' : ''}{userAnswer}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};
