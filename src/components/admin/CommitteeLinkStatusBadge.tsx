import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Building2, AlertTriangle, CheckCircle2, Loader2, Link2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface CommitteeLinkStatusBadgeProps {
  candidateId: string;
  candidateName: string;
  fecCandidateId: string | null;
  fecCommitteeId: string | null;
  committeeCount?: number;
  lastSyncDate?: string | null;
  onLinkCommittees: (candidateId: string, fecCandidateId: string) => Promise<{ success: boolean; primaryCommitteeId?: string | null; error?: string }>;
  onRefetch: () => void;
  disabled?: boolean;
  className?: string;
}

export function CommitteeLinkStatusBadge({
  candidateId,
  candidateName,
  fecCandidateId,
  fecCommitteeId,
  committeeCount = 0,
  lastSyncDate,
  onLinkCommittees,
  onRefetch,
  disabled = false,
  className,
}: CommitteeLinkStatusBadgeProps) {
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasFecId = !!fecCandidateId;
  const hasCommittee = !!fecCommitteeId;

  const handleLink = async () => {
    if (!fecCandidateId || isLinking || disabled) return;
    
    setIsLinking(true);
    setError(null);
    
    try {
      const result = await onLinkCommittees(candidateId, fecCandidateId);
      
      if (result.success && result.primaryCommitteeId) {
        onRefetch();
      } else if (!result.success) {
        setError(result.error || 'Failed to link');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link');
    } finally {
      setIsLinking(false);
    }
  };

  // No FEC ID - can't link committees
  if (!hasFecId) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <Badge 
              variant="outline" 
              className={cn(
                "text-[10px] px-1.5 py-0 h-5 gap-1 border-muted text-muted-foreground",
                className
              )}
            >
              <Building2 className="h-3 w-3" />
              —
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Link FEC ID first to discover committees</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Has FEC ID but no committee - show warning with fix button
  if (!hasCommittee) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLink}
              disabled={isLinking || disabled}
              className={cn(
                "h-6 px-2 py-0 gap-1 text-amber-700 hover:text-amber-800 hover:bg-amber-50 dark:text-amber-300 dark:hover:text-amber-200 dark:hover:bg-amber-950/50",
                error && "text-destructive hover:text-destructive",
                className
              )}
            >
              {isLinking ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : error ? (
                <AlertTriangle className="h-3 w-3" />
              ) : (
                <Link2 className="h-3 w-3" />
              )}
              <span className="text-[10px] font-medium">
                {isLinking ? 'Linking...' : error ? 'Retry' : 'Link Cmte'}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs space-y-1">
              <p className="font-medium">No committees linked</p>
              <p className="text-muted-foreground">
                {error || 'Click to discover and link FEC committees'}
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Has committees - show linked status
  const committeesLabel = committeeCount > 1 ? `${committeeCount} Cmtes` : 'Linked';
  const lastSyncLabel = lastSyncDate 
    ? formatDistanceToNow(new Date(lastSyncDate), { addSuffix: true })
    : null;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center gap-1", className)}>
            <Badge 
              variant="outline" 
              className="text-[10px] px-1.5 py-0 h-5 gap-1 border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950/50 dark:text-green-300"
            >
              <CheckCircle2 className="h-3 w-3 text-green-600" />
              {committeesLabel}
            </Badge>
            {/* Refresh button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLink}
              disabled={isLinking || disabled}
              className="h-5 w-5 p-0 text-muted-foreground hover:text-primary"
              title="Refresh committees"
            >
              {isLinking ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </Button>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-1">
            <p className="font-medium">
              {committeeCount > 1 ? `${committeeCount} committees linked` : 'Committee linked'}
            </p>
            <p className="text-muted-foreground">
              Primary: {fecCommitteeId}
            </p>
            {lastSyncLabel && (
              <p className="text-muted-foreground">Last sync: {lastSyncLabel}</p>
            )}
            <p className="text-muted-foreground/75 text-[10px]">
              Click refresh to re-fetch committees from FEC
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
