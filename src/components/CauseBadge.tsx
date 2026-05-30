import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Target } from 'lucide-react';
import type { DonorCauseInfo } from '@/hooks/useDonorCauses';

interface CauseBadgeProps {
  cause: DonorCauseInfo;
  compact?: boolean;
}

export function CauseBadge({ cause, compact = true }: CauseBadgeProps) {
  const badgeLabel = compact ? cause.label : `Primary cause: ${cause.label}`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`${compact ? 'text-[10px]' : 'max-w-full whitespace-normal text-left text-xs leading-tight'} gap-1 border-emerald-500/40 text-emerald-700 bg-emerald-500/10 dark:text-emerald-400`}
          >
            <Target className="h-3 w-3" />
            {badgeLabel}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="font-medium mb-1">Primary cause: {cause.label}</p>
          {cause.description && (
            <p className="text-xs text-muted-foreground mb-1">{cause.description}</p>
          )}
          <p className="text-[10px] text-muted-foreground">
            {cause.adminOverridden
              ? 'Assigned by admin'
              : cause.assignedBy === 'ai'
              ? `Assigned by AI${cause.confidence ? ` · ${cause.confidence} confidence` : ''}`
              : `Assigned by ${cause.assignedBy}`}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
