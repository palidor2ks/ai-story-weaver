import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle2, AlertTriangle, XCircle, Minus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn, formatCompactCurrency as formatCompactCurrencyLib } from '@/lib/utils';

interface FinanceStatusBadgeProps {
  status: 'ok' | 'warning' | 'error' | null;
  deltaPct?: number | null;
  deltaAmount?: number | null;
  fecTotalReceipts?: number | null;
  localItemized?: number;
  reconciliationCheckedAt?: string | null;
  showDelta?: boolean;
  className?: string;
}

export function FinanceStatusBadge({ 
  status, 
  deltaPct,
  deltaAmount,
  fecTotalReceipts,
  localItemized = 0,
  reconciliationCheckedAt,
  showDelta = false,
  className 
}: FinanceStatusBadgeProps) {
  const formatCurrency = (value?: number | null) => formatCompactCurrencyLib(value ?? null);

  const formatCompactCurrency = (value?: number | null) => {
    if (value === null || value === undefined) return '—';
    const absVal = Math.abs(value);
    const sign = value < 0 ? '-' : '+';
    if (absVal >= 1000000) return `${sign}$${(absVal / 1000000).toFixed(1)}M`;
    if (absVal >= 1000) return `${sign}$${(absVal / 1000).toFixed(0)}K`;
    return `${sign}$${absVal.toFixed(0)}`;
  };

  if (fecTotalReceipts === null || fecTotalReceipts === undefined) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <Badge 
              variant="outline" 
              className={cn(
                "text-[10px] px-1.5 py-0 h-5 gap-1 border-muted-foreground/30 text-muted-foreground",
                className
              )}
            >
              <Minus className="h-3 w-3" />
              No Data
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">No FEC finance data available</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const getStatusConfig = () => {
    switch (status) {
      case 'ok':
        return {
          icon: CheckCircle2,
          label: 'Balanced',
          badgeClass: 'border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950/50 dark:text-green-300',
          iconClass: 'text-green-600'
        };
      case 'warning':
        return {
          icon: AlertTriangle,
          label: `${Math.abs(deltaPct || 0).toFixed(0)}% off`,
          badgeClass: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
          iconClass: 'text-amber-600'
        };
      case 'error':
        return {
          icon: XCircle,
          label: `${Math.abs(deltaPct || 0).toFixed(0)}% off`,
          badgeClass: 'border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/50 dark:text-red-300',
          iconClass: 'text-red-600'
        };
      default:
        return {
          icon: Minus,
          label: 'Unknown',
          badgeClass: 'border-muted-foreground/30 text-muted-foreground',
          iconClass: 'text-muted-foreground'
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={cn(
              "text-[10px] px-1.5 py-0 h-5 gap-1",
              config.badgeClass,
              className
            )}
          >
            <Icon className={cn("h-3 w-3", config.iconClass)} />
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="space-y-1">
            <div className="font-medium">Finance Status</div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">FEC Total:</span>
              <span>{formatCurrency(fecTotalReceipts)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Local Itemized:</span>
              <span>{formatCurrency(localItemized)}</span>
            </div>
            {deltaPct !== null && deltaPct !== undefined && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Variance:</span>
                <span className={status === 'ok' ? 'text-green-600' : status === 'error' ? 'text-red-600' : 'text-amber-600'}>
                  {deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}%
                </span>
              </div>
            )}
            {reconciliationCheckedAt && (
              <div className="text-muted-foreground border-t pt-1 mt-1">
                Last checked: {formatDistanceToNow(new Date(reconciliationCheckedAt), { addSuffix: true })}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
