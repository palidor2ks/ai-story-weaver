import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Vote, Mic, Globe, ScrollText, FileText, HelpCircle, ShieldCheck, Shield, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CandidateAnswer, getSourceTypeLabel } from '@/hooks/useCandidateAnswers';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface CompactPositionRowProps {
  answer: CandidateAnswer;
  userAnswer?: number | null;
  userAnswerText?: string | null;
}

export const CompactPositionRow = ({ answer, userAnswer, userAnswerText }: CompactPositionRowProps) => {
  const [isOpen, setIsOpen] = useState(false);

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

  const getConfidenceInfo = (confidence: CandidateAnswer['confidence']) => {
    switch (confidence) {
      case 'high': return { icon: ShieldCheck, color: 'text-green-500', label: 'Verified' };
      case 'medium': return { icon: Shield, color: 'text-amber-500', label: 'Likely' };
      case 'low': return { icon: ShieldAlert, color: 'text-red-400', label: 'Unverified' };
    }
  };

  const getScoreColor = (value: number) => {
    if (value >= 5) return 'text-red-600 bg-red-500/10';
    if (value <= -5) return 'text-blue-600 bg-blue-500/10';
    return 'text-purple-600 bg-purple-500/10';
  };

  const getScoreLabel = (value: number) => {
    if (value >= 5) return 'Conservative';
    if (value <= -5) return 'Progressive';
    return 'Moderate';
  };

  const getAnswerText = (value: number): string | null => {
    if (!answer.question?.question_options?.length) return null;
    const exactMatch = answer.question.question_options.find(opt => opt.value === value);
    if (exactMatch) return exactMatch.text;
    const sorted = [...answer.question.question_options].sort(
      (a, b) => Math.abs(a.value - value) - Math.abs(b.value - value)
    );
    return sorted[0]?.text || null;
  };

  const getAgreementStatus = () => {
    if (userAnswer === null || userAnswer === undefined) return null;
    const difference = Math.abs(answer.answer_value - userAnswer);
    const sameSign = answer.answer_value * userAnswer > 0;
    
    if (difference <= 4 && (sameSign || Math.abs(answer.answer_value) <= 2)) {
      return { label: 'Agree', className: 'bg-agree/20 text-agree border-agree/30' };
    }
    if (difference >= 10 || (answer.answer_value * userAnswer < 0 && Math.abs(answer.answer_value) > 4)) {
      return { label: 'Disagree', className: 'bg-disagree/20 text-disagree border-disagree/30' };
    }
    return { label: 'Mixed', className: 'text-muted-foreground border-border' };
  };

  const SourceIcon = getSourceIcon(answer.source_type);
  const confidenceInfo = getConfidenceInfo(answer.confidence);
  const agreementStatus = getAgreementStatus();

  return (
    <TooltipProvider>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors border border-transparent hover:border-border/50 group">
            <div className="flex items-center gap-2">
              {/* Question (truncated) */}
              <p className="flex-1 text-sm text-foreground truncate min-w-0">
                {answer.question?.text}
              </p>
              
              {/* Score badge */}
              <span className={cn(
                "text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0",
                getScoreColor(answer.answer_value)
              )}>
                {answer.answer_value > 0 ? '+' : ''}{answer.answer_value}
              </span>

              {/* Agreement badge */}
              {agreementStatus && (
                <Badge variant="outline" className={cn("text-xs flex-shrink-0", agreementStatus.className)}>
                  {agreementStatus.label}
                </Badge>
              )}

              {/* Source icon */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <SourceIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {getSourceTypeLabel(answer.source_type)}
                </TooltipContent>
              </Tooltip>

              {/* Expand icon */}
              {isOpen ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          </button>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="ml-3 mr-3 mb-2 p-3 rounded-lg bg-secondary/30 border border-border/50 space-y-3">
            {/* Full question */}
            <p className="text-sm font-medium text-foreground">{answer.question?.text}</p>

            {/* Candidate's answer text */}
            {getAnswerText(answer.answer_value) && (
              <div className="p-2 rounded bg-primary/5 border border-primary/10">
                <p className="text-sm text-foreground italic">"{getAnswerText(answer.answer_value)}"</p>
              </div>
            )}

            {/* Score details */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn(
                "font-bold px-2 py-1 rounded",
                getScoreColor(answer.answer_value)
              )}>
                {answer.answer_value > 0 ? '+' : ''}{answer.answer_value}
              </span>
              <span className="text-sm text-muted-foreground">{getScoreLabel(answer.answer_value)}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <confidenceInfo.icon className={cn("w-4 h-4", confidenceInfo.color)} />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {confidenceInfo.label}
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Source */}
            <div className="flex items-center gap-2 text-xs">
              <SourceIcon className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-medium">{getSourceTypeLabel(answer.source_type)}</span>
              {answer.source_description && (
                <span className="text-muted-foreground truncate">• {answer.source_description}</span>
              )}
              {answer.source_url && (
                <a
                  href={answer.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 ml-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  View <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {/* User comparison */}
            {userAnswer !== null && userAnswer !== undefined && (
              <div className="pt-2 border-t border-border/50">
                <div className="text-xs text-muted-foreground mb-1">Your answer:</div>
                {(userAnswerText || getAnswerText(userAnswer)) && (
                  <p className="text-sm italic text-foreground/80 mb-1">
                    "{userAnswerText || getAnswerText(userAnswer)}"
                  </p>
                )}
                <span className={cn(
                  "font-medium px-1.5 py-0.5 rounded text-xs",
                  getScoreColor(userAnswer)
                )}>
                  {userAnswer > 0 ? '+' : ''}{userAnswer}
                </span>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </TooltipProvider>
  );
};
