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

  const { 
    fec_itemized, fec_unitemized, fec_total_receipts, status,
    local_individual_itemized, local_pac_contributions, local_party_contributions,
    fec_pac_contributions, fec_party_contributions,
    individual_delta_pct, pac_delta_pct
  } = reconciliation;
  
  const formatCurrency = (value: number | null) => {
    if (value === null) return '—';
    return `$${Math.round(value).toLocaleString()}`;
  };

  const formatDelta = (pct: number | null) => {
    if (pct === null) return '';
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}%`;
  };

  const getDeltaColor = (pct: number | null) => {
    if (pct === null) return 'text-muted-foreground';
    const abs = Math.abs(pct);
    if (abs <= 5) return 'text-agree';
    if (abs <= 10) return 'text-amber-500';
    return 'text-destructive';
  };
  
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
            <span className="text-muted-foreground">Individual:</span>
            <span className={cn("ml-1 font-medium", getDeltaColor(individual_delta_pct))}>
              {formatDelta(individual_delta_pct)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">PAC:</span>
            <span className={cn("ml-1 font-medium", getDeltaColor(pac_delta_pct))}>
              {formatDelta(pac_delta_pct)}
            </span>
          </div>
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
          {/* Category Comparison Table */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Apples-to-Apples Comparison</p>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="text-left p-2 font-medium">Category</th>
                    <th className="text-right p-2 font-medium">Local</th>
                    <th className="text-right p-2 font-medium">FEC</th>
                    <th className="text-right p-2 font-medium">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border">
                    <td className="p-2 flex items-center gap-1">
                      Individual
                      <Tooltip>
                        <TooltipTrigger><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                        <TooltipContent>Line 11A/11AI - Individual itemized contributions $200+</TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="text-right p-2">{formatCurrency(local_individual_itemized)}</td>
                    <td className="text-right p-2">{formatCurrency(fec_itemized)}</td>
                    <td className={cn("text-right p-2 font-medium", getDeltaColor(individual_delta_pct))}>
                      {formatDelta(individual_delta_pct)}
                    </td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="p-2 flex items-center gap-1">
                      PAC
                      <Tooltip>
                        <TooltipTrigger><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                        <TooltipContent>Line 11C - Other political committee contributions</TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="text-right p-2">{formatCurrency(local_pac_contributions)}</td>
                    <td className="text-right p-2">{formatCurrency(fec_pac_contributions)}</td>
                    <td className={cn("text-right p-2 font-medium", getDeltaColor(pac_delta_pct))}>
                      {formatDelta(pac_delta_pct)}
                    </td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="p-2 flex items-center gap-1">
                      Party
                      <Tooltip>
                        <TooltipTrigger><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                        <TooltipContent>Line 11B - Political party committee contributions</TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="text-right p-2">{formatCurrency(local_party_contributions)}</td>
                    <td className="text-right p-2">{formatCurrency(fec_party_contributions)}</td>
                    <td className="text-right p-2 text-muted-foreground">—</td>
                  </tr>
                  <tr className="border-t border-border bg-secondary/30">
                    <td className="p-2 font-medium">Unitemized</td>
                    <td className="text-right p-2 text-muted-foreground">N/A</td>
                    <td className="text-right p-2">{formatCurrency(fec_unitemized)}</td>
                    <td className="text-right p-2 text-muted-foreground">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Total Receipts */}
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <p className="text-xs text-muted-foreground">FEC Total Receipts</p>
            <p className="font-bold text-xl">{formatCurrency(fec_total_receipts)}</p>
          </div>

          {/* Committee breakdown */}
          {rollups.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">By Committee</p>
              <div className="space-y-2">
                {rollups.map(r => (
                  <div key={r.id} className="flex justify-between items-center text-sm p-2 rounded bg-secondary/30">
                    <span className="text-muted-foreground truncate max-w-[150px]">{r.committee_id}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span title="Individual">{formatCurrency(r.local_individual_itemized)}</span>
                      <span className="text-muted-foreground" title="PAC">+{formatCurrency(r.local_pac_contributions)}</span>
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
