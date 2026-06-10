import { Link, useNavigate } from 'react-router-dom';
import { Candidate } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { MapPin, ArrowRightLeft, Sparkles } from 'lucide-react';
import { ScoreText } from './ScoreText';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { OfficialAvatar } from './OfficialAvatar';
import { useAuth } from '@/context/AuthContext';
import { IESummaryInline } from './IESummaryInline';
import type { IETotals } from '@/hooks/useIndependentExpenditures';
import { normalizeOfficeName } from '@/lib/officeLabel';

interface CandidateCardProps {
  candidate: Candidate;
  index?: number;
  compareMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (candidate: Candidate) => void;
  ieTotals?: IETotals;
}

export const CandidateCard = ({ 
  candidate, 
  index = 0,
  compareMode = false,
  isSelected = false,
  onToggleSelect,
  ieTotals,
}: CandidateCardProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const hasAIAnswers = candidate.hasAIAnswers ?? false;
  const answerCount = candidate.answerCount;

  const getPartyColor = (party: string) => {
    switch (party) {
      case 'Democrat': return 'text-blue-600';
      case 'Republican': return 'text-red-600';
      case 'Independent': return 'text-purple-600';
      default: return 'text-muted-foreground';
    }
  };

  const getPartyInitial = (party: string) => {
    switch (party) {
      case 'Democrat': return 'D';
      case 'Republican': return 'R';
      case 'Independent': return 'I';
      default: return '?';
    }
  };

  // Incumbency + transition status from candidate (with defaults)
  const isIncumbent = candidate.isIncumbent ?? true;
  const transitionStatus = candidate.transitionStatus;
  // Former office holders (e.g. "Former President") are flagged via their office
  // label so the badge reads "Former" rather than the misleading "Challenger".
  const isFormer = /^former\b/i.test(candidate.office ?? '');

  const handleCardClick = (e: React.MouseEvent) => {
    if (compareMode && onToggleSelect) {
      e.preventDefault();
      onToggleSelect(candidate);
      return;
    }

    if (!compareMode && !user) {
      e.preventDefault();
      navigate('/auth');
    }
  };

  const cardContent = (
    <Card 
      className={cn(
        "group transition-all duration-300 cursor-pointer",
        "animate-slide-up bg-card border-border",
        compareMode 
          ? isSelected 
            ? "ring-2 ring-primary shadow-lg" 
            : "hover:ring-1 hover:ring-primary/50"
          : "hover:shadow-lg hover:-translate-y-1"
      )}
      style={{ animationDelay: `${index * 50}ms` }}
      onClick={handleCardClick}
    >
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Top row: Checkbox + Avatar + Name/Info */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Compare checkbox */}
            {compareMode && (
              <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <Checkbox 
                  checked={isSelected}
                  onCheckedChange={() => onToggleSelect?.(candidate)}
                  className="w-5 h-5"
                  aria-label={`Compare ${candidate.name}`}
                />
              </div>
            )}

            {/* Compact Avatar */}
            <OfficialAvatar
              imageUrl={candidate.imageUrl}
              name={candidate.name}
              party={candidate.party}
              size="md"
            />

            {/* Name & Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-display text-base font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 break-words">
                  {candidate.name}
                </h3>
                <span className={cn("text-xs font-bold flex-shrink-0", getPartyColor(candidate.party))}>
                  ({getPartyInitial(candidate.party)})
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="line-clamp-2 break-words">{normalizeOfficeName(candidate.office)}</span>
                <span className="flex-shrink-0">•</span>
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span className="flex-shrink-0">{candidate.state}</span>
              </div>
              <IESummaryInline totals={ieTotals} className="mt-1" />
            </div>
          </div>

          {/* Icons and Score - below on mobile, right side on desktop */}
          <TooltipProvider>
            <div className="flex items-center justify-between sm:flex-col sm:items-end gap-2 sm:gap-1 pl-12 sm:pl-0">
              {/* Incumbent / Challenger status */}
              <div className="flex items-center gap-1.5">
                {transitionStatus && transitionStatus !== 'current' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ArrowRightLeft className="w-4 h-4 text-amber-500" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">Transitioning</TooltipContent>
                  </Tooltip>
                )}
                <Badge
                  variant="outline"
                  className={cn(
                    "h-5 px-2 py-0 text-[10px] font-semibold",
                    isFormer
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-700"
                      : isIncumbent
                        ? "border-green-500/40 bg-green-500/10 text-green-700"
                        : "border-border bg-muted text-muted-foreground"
                  )}
                >
                  {isFormer ? 'Former' : isIncumbent ? 'Incumbent' : 'Challenger'}
                </Badge>
              </div>

              {/* Score with AI indicator */}
              <div className="flex items-center gap-1.5">
                {hasAIAnswers && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Sparkles className="w-3.5 h-3.5 text-accent" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      AI-predicted positions ({answerCount} answers)
                    </TooltipContent>
                  </Tooltip>
                )}
                <ScoreText score={candidate.overallScore} size="lg" />
              </div>
            </div>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );

  // In compare mode, don't wrap in Link
  if (compareMode) {
    return cardContent;
  }

  return (
    <Link to={`/candidate/${candidate.id}`}>
      {cardContent}
    </Link>
  );
};
