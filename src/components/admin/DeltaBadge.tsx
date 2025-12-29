import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';

interface DeltaBadgeProps {
  deltaAmount?: number | null;
  deltaPct?: number | null;
  className?: string;
}

export function DeltaBadge({ deltaAmount, deltaPct, className }: DeltaBadgeProps) {
  const formatCompactCurrency = (value: number) => {
    const absVal = Math.abs(value);
    const sign = value < 0 ? '-' : '+';
    if (absVal >= 1000000) return `${sign}$${(absVal / 1000000).toFixed(1)}M`;
    if (absVal >= 1000) return `${sign}$${(absVal / 1000).toFixed(0)}K`;
    return `${sign}$${absVal.toFixed(0)}`;
  };

  // No data case
  if (deltaAmount === null || deltaAmount === undefined || deltaPct === null || deltaPct === undefined) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>—</span>
    );
  }

  const absPct = Math.abs(deltaPct);
  
  // Determine color based on variance percentage
  const getColorClass = () => {
    if (absPct <= 2) return 'text-green-600 dark:text-green-400';
    if (absPct <= 5) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getIcon = () => {
    if (absPct <= 2) return null;
    if (deltaAmount < 0) return TrendingDown;
    return TrendingUp;
  };

  const colorClass = getColorClass();
  const Icon = getIcon();

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center gap-0.5 text-xs font-medium whitespace-nowrap", colorClass, className)}>
            {Icon && <Icon className="h-3 w-3" />}
            <span>{formatCompactCurrency(deltaAmount)}</span>
            <span className="text-muted-foreground/70">({deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}%)</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="space-y-1">
            <div className="font-medium">Finance Variance</div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Delta Amount:</span>
              <span className={colorClass}>
                {deltaAmount < 0 ? '-' : '+'}${Math.abs(deltaAmount).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Delta %:</span>
              <span className={colorClass}>
                {deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(2)}%
              </span>
            </div>
            <div className="text-muted-foreground border-t pt-1 mt-1 text-[10px]">
              {absPct <= 2 && 'Within expected threshold (±2%)'}
              {absPct > 2 && absPct <= 5 && 'Minor variance (2-5%)'}
              {absPct > 5 && 'Significant variance (>5%)'}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
