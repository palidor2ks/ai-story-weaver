import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TrendingDown, TrendingUp, CheckCircle2, AlertTriangle } from 'lucide-react';

interface DeltaBadgeProps {
  // Total receipts delta (primary display - what FEC/Local columns show)
  deltaAmount?: number | null;
  deltaPct?: number | null;
  // Itemized delta (secondary - for data integrity, shown in tooltip)
  itemizedDeltaAmount?: number | null;
  itemizedDeltaPct?: number | null;
  // Category-level deltas
  individualDeltaPct?: number | null;
  pacDeltaPct?: number | null;
  className?: string;
}

export function DeltaBadge({ 
  deltaAmount, 
  deltaPct, 
  itemizedDeltaAmount,
  itemizedDeltaPct,
  individualDeltaPct,
  pacDeltaPct,
  className 
}: DeltaBadgeProps) {
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
  const getColorClass = (pct: number | null | undefined) => {
    if (pct === null || pct === undefined) return 'text-muted-foreground';
    const abs = Math.abs(pct);
    if (abs <= 2) return 'text-green-600 dark:text-green-400';
    if (abs <= 5) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getIcon = () => {
    if (absPct <= 2) return null;
    if (deltaAmount < 0) return TrendingDown;
    return TrendingUp;
  };

  const colorClass = getColorClass(deltaPct);
  const Icon = getIcon();

  // Find worst category
  const categories = [
    { name: 'Individuals', pct: individualDeltaPct },
    { name: 'PACs', pct: pacDeltaPct },
  ].filter(c => c.pct !== null && c.pct !== undefined);
  
  const worstCategory = categories.reduce((worst, cat) => {
    const currentAbs = Math.abs(cat.pct ?? 0);
    const worstAbs = Math.abs(worst?.pct ?? 0);
    return currentAbs > worstAbs ? cat : worst;
  }, categories[0]);

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
        <TooltipContent side="top" className="text-xs max-w-[300px]">
          <div className="space-y-1.5">
            <div className="font-medium">Finance Variance</div>
            
            {/* Total Receipts Delta (primary) */}
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Total Receipts:</span>
              <span className={colorClass}>
                {deltaAmount < 0 ? '-' : '+'}${Math.abs(deltaAmount).toLocaleString()} ({deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}%)
              </span>
            </div>
            
            {/* Itemized Delta (secondary - data integrity check) */}
            {itemizedDeltaAmount !== null && itemizedDeltaAmount !== undefined && 
             itemizedDeltaPct !== null && itemizedDeltaPct !== undefined && (
              <div className="flex justify-between gap-4 text-[10px]">
                <span className="text-muted-foreground">Itemized Only:</span>
                <span className={getColorClass(itemizedDeltaPct)}>
                  {itemizedDeltaAmount < 0 ? '-' : '+'}${Math.abs(itemizedDeltaAmount).toLocaleString()} ({itemizedDeltaPct > 0 ? '+' : ''}{itemizedDeltaPct.toFixed(1)}%)
                </span>
              </div>
            )}
            
            {/* Category breakdown */}
            {categories.length > 0 && (
              <>
                <div className="border-t pt-1.5 mt-1.5">
                  <div className="text-muted-foreground mb-1">Itemized by Category:</div>
                  {individualDeltaPct !== null && individualDeltaPct !== undefined && (
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">├─ Individuals:</span>
                      <span className={getColorClass(individualDeltaPct)}>
                        {individualDeltaPct > 0 ? '+' : ''}{individualDeltaPct.toFixed(1)}%
                        {Math.abs(individualDeltaPct) <= 2 && <CheckCircle2 className="h-3 w-3 inline ml-1" />}
                      </span>
                    </div>
                  )}
                  {pacDeltaPct !== null && pacDeltaPct !== undefined && (
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">└─ PACs:</span>
                      <span className={getColorClass(pacDeltaPct)}>
                        {pacDeltaPct > 0 ? '+' : ''}{pacDeltaPct.toFixed(1)}%
                        {Math.abs(pacDeltaPct) <= 2 && <CheckCircle2 className="h-3 w-3 inline ml-1" />}
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
            
            {/* Worst category indicator */}
            {worstCategory && Math.abs(worstCategory.pct ?? 0) > 2 && (
              <div className="flex items-center gap-1 pt-1 border-t mt-1">
                <AlertTriangle className="h-3 w-3 text-amber-500" />
                <span className="text-muted-foreground">Largest gap:</span>
                <span className={getColorClass(worstCategory.pct)}>
                  {worstCategory.name} ({worstCategory.pct! > 0 ? '+' : ''}{worstCategory.pct?.toFixed(1)}%)
                </span>
              </div>
            )}
            
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
