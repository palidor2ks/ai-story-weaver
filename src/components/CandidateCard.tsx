import { Link } from 'react-router-dom';
import { Candidate } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { MapPin, Star, Shield, ArrowRightLeft, CheckCircle, Sparkles } from 'lucide-react';
import { ScoreText } from './ScoreText';
import { CoverageTier, ConfidenceLevel } from '@/lib/scoreFormat';
import { TransitionStatus } from './TransitionBadge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface CandidateCardProps {
  candidate: Candidate;
  index?: number;
  compareMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (candidate: Candidate) => void;
}

export const CandidateCard = ({ 
  candidate, 
  index = 0,
  compareMode = false,
  isSelected = false,
  onToggleSelect
}: CandidateCardProps) => {
  const hasAIAnswers = (candidate as any).hasAIAnswers ?? false;
  const answerCount = (candidate as any).answerCount;

  const getPartyColor = (party: string) => {
    switch (party) {
      case 'Democrat': return 'text-blue-600';
      case 'Republican': return 'text-red-600';
      case 'Independent': return 'text-purple-600';
      default: return 'text-muted-foreground';
    }
  };

  const getPartyBgColor = (party: string) => {
    switch (party) {
      case 'Democrat': return 'bg-blue-600';
      case 'Republican': return 'bg-red-600';
      case 'Independent': return 'bg-purple-600';
      default: return 'bg-muted';
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

  const getInitials = (name: string) => {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return parts[0]?.[0]?.toUpperCase() || '?';
  };

  // Get coverage tier, confidence, and transition status from candidate (with defaults)
  const coverageTier: CoverageTier = (candidate as any).coverageTier || 'tier_3';
  const confidence: ConfidenceLevel = (candidate as any).confidence || 'medium';
  const isIncumbent: boolean = (candidate as any).isIncumbent ?? true;
  const transitionStatus: TransitionStatus | undefined = (candidate as any).transitionStatus;

  const getTierIcon = (tier: CoverageTier) => {
    switch (tier) {
      case 'tier_1': return { icon: Star, label: 'Tier 1 - Full Coverage', color: 'text-amber-500' };
      case 'tier_2': return { icon: Star, label: 'Tier 2 - Partial Coverage', color: 'text-slate-400' };
      case 'tier_3': return { icon: Star, label: 'Tier 3 - Basic Coverage', color: 'text-slate-300' };
    }
  };

  const getConfidenceIcon = (conf: ConfidenceLevel) => {
    switch (conf) {
      case 'high': return { icon: Shield, label: 'High Confidence', color: 'text-green-500' };
      case 'medium': return { icon: Shield, label: 'Medium Confidence', color: 'text-amber-500' };
      case 'low': return { icon: Shield, label: 'Low Confidence', color: 'text-red-400' };
    }
  };

  const tierInfo = getTierIcon(coverageTier);
  const confidenceInfo = getConfidenceIcon(confidence);

  const handleCardClick = (e: React.MouseEvent) => {
    if (compareMode && onToggleSelect) {
      e.preventDefault();
      onToggleSelect(candidate);
    }
  };

  const cardContent = (
    <Card 
      className={cn(
        "group overflow-hidden transition-all duration-300 cursor-pointer",
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
        <div className="flex items-center gap-3">
          {/* Compare checkbox */}
          {compareMode && (
            <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <Checkbox 
                checked={isSelected}
                onCheckedChange={() => onToggleSelect?.(candidate)}
                className="w-5 h-5"
              />
            </div>
          )}

          {/* Compact Avatar */}
          <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0">
            {candidate.imageUrl && candidate.imageUrl.trim() !== '' ? (
              <img 
                src={candidate.imageUrl}
                alt={candidate.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.style.display = 'none';
                  const fallback = target.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
            ) : null}
            <div 
              className={cn("w-full h-full flex items-center justify-center", getPartyBgColor(candidate.party))}
              style={{ display: candidate.imageUrl && candidate.imageUrl.trim() !== '' ? 'none' : 'flex' }}
            >
              <span className="text-white font-bold text-sm">{getInitials(candidate.name)}</span>
            </div>
          </div>

          {/* Name & Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                {candidate.name}
              </h3>
              <span className={cn("text-xs font-bold", getPartyColor(candidate.party))}>
                ({getPartyInitial(candidate.party)})
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="truncate">{candidate.office}</span>
              <span>•</span>
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span>{candidate.state}</span>
            </div>
          </div>

          {/* Icon badges */}
          <TooltipProvider>
            <div className="flex items-center gap-1 flex-shrink-0">
              {isIncumbent && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Incumbent</TooltipContent>
                </Tooltip>
              )}
              {transitionStatus && transitionStatus !== 'current' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ArrowRightLeft className="w-4 h-4 text-amber-500" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Transitioning</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <tierInfo.icon className={cn("w-4 h-4", tierInfo.color)} />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">{tierInfo.label}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <confidenceInfo.icon className={cn("w-4 h-4", confidenceInfo.color)} />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">{confidenceInfo.label}</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>

          {/* Political Score */}
          <div className="flex-shrink-0 flex items-center gap-1.5">
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
