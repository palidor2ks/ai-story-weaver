import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Building2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CommitteeStatusBadgeProps {
  hasCommittee: boolean;
  hasFecId: boolean;
  committeeCount?: number;
  className?: string;
}

export function CommitteeStatusBadge({ 
  hasCommittee, 
  hasFecId,
  committeeCount = 0,
  className 
}: CommitteeStatusBadgeProps) {
  if (!hasFecId) {
    return null; // Don't show anything if no FEC ID
  }

  if (!hasCommittee) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <Badge 
              variant="outline" 
              className={cn(
                "text-[10px] px-1.5 py-0 h-5 gap-1 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
                className
              )}
            >
              <AlertTriangle className="h-3 w-3 text-amber-600" />
              No Cmte
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Link a committee to enable donor sync</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={cn(
              "text-[10px] px-1.5 py-0 h-5 gap-1 border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
              className
            )}
          >
            <Building2 className="h-3 w-3 text-blue-600" />
            {committeeCount > 1 ? `${committeeCount} Cmtes` : 'Linked'}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            {committeeCount > 1 
              ? `${committeeCount} committees linked - click to manage`
              : 'Committee linked - click to manage'}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
