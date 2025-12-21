import { Badge } from '@/components/ui/badge';
import { getCoverageTierInfo, getConfidenceInfo, CoverageTier, ConfidenceLevel } from '@/lib/scoreFormat';
import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface CoverageTierBadgeProps {
  tier: CoverageTier;
  showTooltip?: boolean;
  className?: string;
}

export const CoverageTierBadge = ({ tier, showTooltip = true, className }: CoverageTierBadgeProps) => {
  const info = getCoverageTierInfo(tier);
  
  const badge = (
    <Badge 
      variant="outline" 
      className={cn('text-xs border', info.color, className)}
    >
      {info.label}
      {showTooltip && <Info className="w-3 h-3 ml-1" />}
    </Badge>
  );
  
  if (!showTooltip) return badge;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-sm max-w-[200px]">{info.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

interface ConfidenceBadgeProps {
  confidence: ConfidenceLevel;
  className?: string;
}

export const ConfidenceBadge = ({ confidence, className }: ConfidenceBadgeProps) => {
  const info = getConfidenceInfo(confidence);
  
  return (
    <Badge 
      variant="secondary" 
      className={cn('text-xs', info.color, className)}
    >
      {info.label}
    </Badge>
  );
};

interface IncumbentBadgeProps {
  isIncumbent: boolean;
  className?: string;
}

export const IncumbentBadge = ({ isIncumbent, className }: IncumbentBadgeProps) => {
  if (isIncumbent) {
    return (
      <Badge variant="outline" className={cn('text-xs bg-blue-50 text-blue-700 border-blue-200', className)}>
        Incumbent
      </Badge>
    );
  }
  
  return (
    <Badge variant="outline" className={cn('text-xs bg-orange-50 text-orange-700 border-orange-200', className)}>
      Challenger
    </Badge>
  );
};
