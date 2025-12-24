import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

  const { fec_itemized, fec_unitemized, fec_total_receipts, status } = reconciliation;
  
  // Calculate Other Receipts using the standard formula
  const otherReceipts = (fec_total_receipts ?? 0) - (fec_itemized ?? 0) - (fec_unitemized ?? 0);
  
  // Validate the equation: Total = Itemized + Unitemized + Other
  const calculatedTotal = (fec_itemized ?? 0) + (fec_unitemized ?? 0) + otherReceipts;
  const isBalanced = Math.abs(calculatedTotal - (fec_total_receipts ?? 0)) < 1;
  
  const getStatusIcon = () => {
    if (!isBalanced) {
      return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    }
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
    if (!isBalanced) {
      return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">Imbalanced</Badge>;
    }
    switch (status) {
      case 'ok':
        return <Badge variant="outline" className="bg-agree/10 text-agree border-agree/30">Balanced</Badge>;
      case 'warning':
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">Warning</Badge>;
      case 'error':
        return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Error</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  const formatCurrency = (value: number | null) => {
    if (value === null) return '—';
    return `$${Math.round(value).toLocaleString()}`;
  };

  if (compact) {
    return (
      <div className="p-3 rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <span className="text-sm font-medium">FEC Data Integrity</span>
          </div>
          {getStatusBadge()}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Itemized:</span>
            <span className="ml-1 font-medium">{formatCurrency(fec_itemized)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Unitemized:</span>
            <span className="ml-1 font-medium">{formatCurrency(fec_unitemized)}</span>
          </div>
          {otherReceipts > 0 && (
            <div>
              <span className="text-muted-foreground">Other:</span>
              <span className="ml-1 font-medium">{formatCurrency(otherReceipts)}</span>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">Total:</span>
            <span className="ml-1 font-semibold">{formatCurrency(fec_total_receipts)}</span>
          </div>
        </div>
        <div className={cn(
          "text-[10px] mt-2 p-1 rounded flex items-center gap-1",
          isBalanced ? "bg-agree/10 text-agree" : "bg-amber-500/10 text-amber-600"
        )}>
          {isBalanced ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          <span>I + U + O = Total</span>
        </div>
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
              FEC Data Reconciliation
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
          {/* FEC Breakdown Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-secondary/50">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                Itemized
                <Tooltip>
                  <TooltipTrigger><Info className="h-3 w-3" /></TooltipTrigger>
                  <TooltipContent>Individual contributions $200+</TooltipContent>
                </Tooltip>
              </p>
              <p className="text-lg font-bold">{formatCurrency(fec_itemized)}</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/50">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                Unitemized
                <Tooltip>
                  <TooltipTrigger><Info className="h-3 w-3" /></TooltipTrigger>
                  <TooltipContent>Contributions under $200</TooltipContent>
                </Tooltip>
              </p>
              <p className="text-lg font-bold">{formatCurrency(fec_unitemized)}</p>
            </div>
          </div>

          {otherReceipts > 0 && (
            <div className="p-3 rounded-lg bg-secondary/50">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                Other Receipts
                <Tooltip>
                  <TooltipTrigger><Info className="h-3 w-3" /></TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    PAC contributions, transfers, loans, refunds, and other receipts
                  </TooltipContent>
                </Tooltip>
              </p>
              <p className="text-lg font-bold">{formatCurrency(otherReceipts)}</p>
            </div>
          )}

          {/* Total Receipts */}
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <p className="text-xs text-muted-foreground">Total Receipts</p>
            <p className="font-bold text-xl">{formatCurrency(fec_total_receipts)}</p>
          </div>

          {/* Equation validation */}
          <div className={cn(
            "p-3 rounded-lg flex items-center justify-between",
            isBalanced ? 'bg-agree/10' : 'bg-amber-500/10'
          )}>
            <div className="flex items-center gap-2">
              {isBalanced ? (
                <CheckCircle2 className="w-4 h-4 text-agree" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              )}
              <span className={cn("text-sm", isBalanced ? "text-agree" : "text-amber-600")}>
                Itemized + Unitemized + Other = Total
              </span>
            </div>
            <span className={cn("text-sm font-medium", isBalanced ? "text-agree" : "text-amber-600")}>
              {isBalanced ? '✓' : `Δ ${formatCurrency(Math.abs(calculatedTotal - (fec_total_receipts ?? 0)))}`}
            </span>
          </div>

          {/* Committee breakdown */}
          {rollups.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">By Committee</p>
              <div className="space-y-2">
                {rollups.map(r => {
                  const committeeOther = (r.fec_total_receipts ?? 0) - (r.fec_itemized ?? 0) - (r.fec_unitemized ?? 0);
                  return (
                    <div key={r.id} className="flex justify-between items-center text-sm p-2 rounded bg-secondary/30">
                      <span className="text-muted-foreground truncate max-w-[150px]">{r.committee_id}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span title="Itemized">{formatCurrency(r.fec_itemized)}</span>
                        {committeeOther > 0 && (
                          <span className="text-muted-foreground" title="Other">+{formatCurrency(committeeOther)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
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
