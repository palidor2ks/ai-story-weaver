import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ArrowRight, Clock, Star } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { TransitionStatus } from '@/types';

// Re-export for backwards compatibility
export type { TransitionStatus };

interface TransitionBadgeProps {
  status: TransitionStatus;
  newOffice?: string;
  className?: string;
  showTooltip?: boolean;
}

const statusConfig: Record<TransitionStatus, {
  label: string;
  description: string;
  icon: React.ReactNode;
  className: string;
}> = {
  incoming: {
    label: 'Elect',
    description: 'Won election, not yet inaugurated',
    icon: <Star className="w-3 h-3" />,
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
  },
  outgoing: {
    label: 'Outgoing',
    description: 'Term ending soon',
    icon: <Clock className="w-3 h-3" />,
    className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  },
  current: {
    label: 'Current',
    description: 'Currently serving',
    icon: null,
    className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  },
  candidate: {
    label: 'Running',
    description: 'Running for different office',
    icon: <ArrowRight className="w-3 h-3" />,
    className: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800',
  },
};

export const TransitionBadge = ({ 
  status, 
  newOffice, 
  className, 
  showTooltip = true 
}: TransitionBadgeProps) => {
  const config = statusConfig[status];
  
  // Build dynamic label for incoming officials
  let displayLabel = config.label;
  if (status === 'incoming' && newOffice) {
    // E.g., "Governor-Elect" instead of just "Elect"
    displayLabel = `${newOffice}-Elect`;
  }
  
  const badge = (
    <Badge 
      variant="outline" 
      className={cn('text-xs border gap-1', config.className, className)}
    >
      {config.icon}
      {displayLabel}
    </Badge>
  );
  
  if (!showTooltip) return badge;
  
  const tooltipText = status === 'incoming' && newOffice
    ? `${config.description}. Will become ${newOffice}.`
    : config.description;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-sm max-w-[200px]">{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

interface TransitionInfoProps {
  currentOffice?: string;
  newOffice: string;
  inaugurationDate: string;
  className?: string;
}

export const TransitionInfo = ({ 
  currentOffice, 
  newOffice, 
  inaugurationDate,
  className 
}: TransitionInfoProps) => {
  const formattedDate = new Date(inaugurationDate).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  });
  
  return (
    <div className={cn('text-sm text-muted-foreground flex items-center gap-2 flex-wrap', className)}>
      {currentOffice && (
        <>
          <span>{currentOffice}</span>
          <ArrowRight className="w-3 h-3" />
        </>
      )}
      <span className="font-medium text-foreground">{newOffice}</span>
      <span className="text-xs">(Inauguration: {formattedDate})</span>
    </div>
  );
};
