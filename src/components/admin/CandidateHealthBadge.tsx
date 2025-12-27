import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle2, AlertTriangle, XCircle, AlertCircle, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CandidateHealthBadgeProps {
  hasFecId: boolean;
  hasCommittee: boolean;
  syncStatus: 'never' | 'partial' | 'complete';
  financeStatus: 'ok' | 'warning' | 'error' | 'none';
  hasOverride: boolean;
  className?: string;
}

export function CandidateHealthBadge({
  hasFecId,
  hasCommittee,
  syncStatus,
  financeStatus,
  hasOverride,
  className
}: CandidateHealthBadgeProps) {
  // Calculate overall health score (0-4)
  let healthScore = 0;
  if (hasFecId) healthScore++;
  if (hasCommittee) healthScore++;
  if (syncStatus === 'complete') healthScore++;
  if (financeStatus === 'ok') healthScore++;

  // Determine health level
  let healthLevel: 'excellent' | 'good' | 'warning' | 'poor';
  let HealthIcon = Circle;
  let healthColor = 'text-muted-foreground';
  let bgColor = 'bg-muted';

  if (healthScore >= 4) {
    healthLevel = 'excellent';
    HealthIcon = CheckCircle2;
    healthColor = 'text-green-600';
    bgColor = 'bg-green-100 dark:bg-green-900/30';
  } else if (healthScore >= 3) {
    healthLevel = 'good';
    HealthIcon = CheckCircle2;
    healthColor = 'text-green-500';
    bgColor = 'bg-green-50 dark:bg-green-950/30';
  } else if (healthScore >= 2) {
    healthLevel = 'warning';
    HealthIcon = AlertCircle;
    healthColor = 'text-amber-500';
    bgColor = 'bg-amber-50 dark:bg-amber-950/30';
  } else {
    healthLevel = 'poor';
    HealthIcon = AlertTriangle;
    healthColor = 'text-red-500';
    bgColor = 'bg-red-50 dark:bg-red-950/30';
  }

  const getStatusIcon = (status: boolean | 'ok' | 'warning' | 'error' | 'none' | 'never' | 'partial' | 'complete') => {
    if (status === true || status === 'ok' || status === 'complete') {
      return <CheckCircle2 className="h-3 w-3 text-green-500" />;
    }
    if (status === 'warning' || status === 'partial') {
      return <AlertCircle className="h-3 w-3 text-amber-500" />;
    }
    if (status === 'error') {
      return <XCircle className="h-3 w-3 text-red-500" />;
    }
    return <XCircle className="h-3 w-3 text-muted-foreground" />;
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <div className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded cursor-help",
            bgColor,
            className
          )}>
            <HealthIcon className={cn("h-3 w-3", healthColor)} />
            {hasOverride && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-primary/50 text-primary">
                Override
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="w-48 p-2">
          <div className="space-y-1.5 text-xs">
            <div className="font-medium border-b pb-1 mb-1.5">
              Health: {healthLevel.charAt(0).toUpperCase() + healthLevel.slice(1)} ({healthScore}/4)
            </div>
            <div className="flex items-center justify-between">
              <span>FEC ID</span>
              {getStatusIcon(hasFecId)}
            </div>
            <div className="flex items-center justify-between">
              <span>Committee</span>
              {getStatusIcon(hasCommittee)}
            </div>
            <div className="flex items-center justify-between">
              <span>Donor Sync</span>
              {getStatusIcon(syncStatus)}
            </div>
            <div className="flex items-center justify-between">
              <span>Finance</span>
              {getStatusIcon(financeStatus)}
            </div>
            {hasOverride && (
              <div className="text-primary border-t pt-1 mt-1">
                Has manual overrides
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
