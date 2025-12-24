
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, CheckCircle2, Info, RefreshCw, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FinanceReconciliation, CommitteeRollup } from '@/hooks/useFinanceReconciliation';

interface FinanceReconciliationCardProps {
  reconciliation: FinanceReconciliation | null;
  rollups?: CommitteeRollup[];
  lastSyncDate?: string | null;
  compact?: boolean;
}

export function FinanceReconciliationCard({
  reconciliation,
  rollups = [],
  lastSyncDate,
  compact = false,
}: FinanceReconciliationCardProps) {
  if (!reconciliation) {
    return (
      <Card className={cn("border-dashed", compact && "p-3")}>
        <CardContent className={cn("py-4", compact && "p-0")}>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span className="text-sm">No finance data synced yet</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { local_itemized, fec_itemized, delta_pct, status, local_transfers, local_earmarked, fec_unitemized, fec_total_receipts } = reconciliation;
  
  const getStatusIcon = () => {
    switch (status) {
      case 'ok':
        return <CheckCircle2 className="w-4 h-4 text-agree" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Info className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'ok':
        return <Badge variant="outline" className="bg-agree/10 text-agree border-agree/30">Matched</Badge>;
      case 'warning':
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">Variance</Badge>;
      case 'error':
        return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Mismatch</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  // Calculate coverage percentage
  const coverage = fec_itemized && fec_itemized > 0 
    ? Math.min(100, Math.round(((local_itemized || 0) / fec_itemized) * 100))
    : 0;

  if (compact) {
    return (
      <div className="p-3 rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <span className="text-sm font-medium">FEC Reconciliation</span>
          </div>
          {getStatusBadge()}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Local:</span>
            <span className="ml-1 font-medium">${(local_itemized || 0).toLocaleString()}</span>
          </div>
          <div>
            <span className="text-muted-foreground">FEC:</span>
            <span className="ml-1 font-medium">${(fec_itemized || 0).toLocaleString()}</span>
          </div>
        </div>
        {delta_pct !== null && delta_pct !== 0 && (
          <div className={cn(
            "text-xs mt-1",
            status === 'error' ? 'text-destructive' : status === 'warning' ? 'text-amber-500' : 'text-muted-foreground'
          )}>
            Δ {delta_pct > 0 ? '+' : ''}{delta_pct.toFixed(1)}%
          </div>
        )}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              {getStatusIcon()}
              FEC Finance Reconciliation
            </CardTitle>
            {getStatusBadge()}
          </div>
          {lastSyncDate && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <RefreshCw className="w-3 h-3" />
              Last synced: {new Date(lastSyncDate).toLocaleDateString()}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Main comparison */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg bg-secondary/50">
              <p className="text-xs text-muted-foreground mb-1">Local Itemized</p>
              <p className="text-xl font-bold">${(local_itemized || 0).toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/50">
              <p className="text-xs text-muted-foreground mb-1">FEC Itemized</p>
              <p className="text-xl font-bold">${(fec_itemized || 0).toLocaleString()}</p>
            </div>
          </div>

          {/* Coverage bar */}
          <div>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-muted-foreground">Coverage</span>
              <span className={cn(
                "font-medium",
                coverage >= 90 ? 'text-agree' : coverage >= 70 ? 'text-amber-500' : 'text-destructive'
              )}>
                {coverage}%
              </span>
            </div>
            <Progress value={coverage} className="h-2" />
          </div>

          {/* Variance indicator */}
          {delta_pct !== null && delta_pct !== 0 && (
            <div className={cn(
              "p-3 rounded-lg flex items-center justify-between",
              status === 'error' ? 'bg-destructive/10' : status === 'warning' ? 'bg-amber-500/10' : 'bg-agree/10'
            )}>
              <span className="text-sm">Variance</span>
              <span className={cn(
                "font-bold",
                status === 'error' ? 'text-destructive' : status === 'warning' ? 'text-amber-500' : 'text-agree'
              )}>
                {delta_pct > 0 ? '+' : ''}{delta_pct.toFixed(2)}%
              </span>
            </div>
          )}

          {/* Breakdown */}
          <div className="space-y-2 pt-2 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Breakdown</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transfers (excluded):</span>
                <span>${(local_transfers || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Earmarked:</span>
                <span>${(local_earmarked || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <Tooltip>
                  <TooltipTrigger className="text-muted-foreground flex items-center gap-1">
                    FEC Unitemized <Info className="w-3 h-3" />
                  </TooltipTrigger>
                  <TooltipContent>Contributions under $200 (not in our data)</TooltipContent>
                </Tooltip>
                <span>${(fec_unitemized || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">FEC Total Receipts:</span>
                <span>${(fec_total_receipts || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Committee breakdown */}
          {rollups.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">By Committee</p>
              <div className="space-y-2">
                {rollups.map(r => (
                  <div key={r.id} className="flex justify-between items-center text-sm p-2 rounded bg-secondary/30">
                    <span className="text-muted-foreground truncate max-w-[200px]">{r.committee_id}</span>
                    <div className="flex items-center gap-3">
                      <span>${(r.local_itemized || 0).toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground">
                        {r.donor_count} donors
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

// Compact badge for use in lists/tables
export function SyncStatusBadge({ status, deltaPct }: { status: string | null; deltaPct: number | null }) {
  if (!status) {
    return <Badge variant="outline" className="text-muted-foreground">No data</Badge>;
  }

  switch (status) {
    case 'ok':
      return (
        <Badge variant="outline" className="bg-agree/10 text-agree border-agree/30">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          OK
        </Badge>
      );
    case 'warning':
      return (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
          <AlertTriangle className="w-3 h-3 mr-1" />
          {deltaPct?.toFixed(1)}%
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
          <XCircle className="w-3 h-3 mr-1" />
          {deltaPct?.toFixed(1)}%
        </Badge>
      );
    default:
      return <Badge variant="outline">Pending</Badge>;
  }
}
