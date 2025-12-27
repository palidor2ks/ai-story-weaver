import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle2, AlertTriangle, Clock, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface SyncStatusBadgeProps {
  status: 'never' | 'partial' | 'complete';
  lastSyncDate?: string | null;
  reconciliationCheckedAt?: string | null;
  hasFecId: boolean;
  className?: string;
}

export function SyncStatusBadge({ 
  status, 
  lastSyncDate, 
  reconciliationCheckedAt,
  hasFecId,
  className 
}: SyncStatusBadgeProps) {
  if (!hasFecId) {
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
              <XCircle className="h-3 w-3" />
              No FEC
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Link FEC ID first to enable donor sync</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const getStatusConfig = () => {
    switch (status) {
      case 'complete':
        return {
          icon: CheckCircle2,
          label: 'Synced',
          badgeClass: 'border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950/50 dark:text-green-300',
          iconClass: 'text-green-600'
        };
      case 'partial':
        return {
          icon: AlertTriangle,
          label: 'Partial',
          badgeClass: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
          iconClass: 'text-amber-600'
        };
      default:
        return {
          icon: Clock,
          label: 'Never',
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
            <div className="font-medium">Donor Sync: {config.label}</div>
            {lastSyncDate && (
              <div className="text-muted-foreground">
                Last sync: {formatDistanceToNow(new Date(lastSyncDate), { addSuffix: true })}
              </div>
            )}
            {reconciliationCheckedAt && (
              <div className="text-muted-foreground">
                Last reconciled: {formatDistanceToNow(new Date(reconciliationCheckedAt), { addSuffix: true })}
              </div>
            )}
            {status === 'partial' && (
              <div className="text-amber-600">Click Resume to continue syncing</div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
