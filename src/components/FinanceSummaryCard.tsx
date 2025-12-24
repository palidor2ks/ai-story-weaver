import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DollarSign, Info, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FinanceSummaryData {
  localGross: number | null;
  localNet: number | null;
  fecItemized: number | null;
  fecUnitemized: number | null;
  fecTotalReceipts: number | null;
  deltaAmount?: number | null;
  deltaPct?: number | null;
  status?: 'ok' | 'warning' | 'error' | 'pending' | null;
}

interface FinanceSummaryCardProps {
  data: FinanceSummaryData;
  compact?: boolean;
  className?: string;
}

const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '—';
  return `$${Math.round(value).toLocaleString()}`;
};

const getStatusBadge = (status: FinanceSummaryData['status']) => {
  switch (status) {
    case 'ok':
      return (
        <Badge variant="secondary" className="bg-agree/10 text-agree border-agree/30">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Matched
        </Badge>
      );
    case 'warning':
      return (
        <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Variance
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="secondary" className="bg-disagree/10 text-disagree border-disagree/30">
          <XCircle className="h-3 w-3 mr-1" />
          Mismatch
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="secondary" className="bg-muted text-muted-foreground">
          Pending
        </Badge>
      );
    default:
      return null;
  }
};

export function FinanceSummaryCard({ data, compact = false, className }: FinanceSummaryCardProps) {
  const earmarkPassThroughs = (data.localGross ?? 0) - (data.localNet ?? 0);
  const hasLocalData = data.localGross !== null && data.localGross > 0;
  const hasFecData = data.fecItemized !== null;

  if (!hasLocalData && !hasFecData) {
    return null;
  }

  if (compact) {
    return (
      <TooltipProvider>
        <div className={cn("space-y-2 text-xs", className)}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-sm">Finance Summary</span>
            {getStatusBadge(data.status)}
          </div>
          
          {/* Local Data */}
          <div className="space-y-1 pb-2 border-b border-border/50">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Local Gross:</span>
              <span>{formatCurrency(data.localGross)}</span>
            </div>
            {earmarkPassThroughs > 0 && (
              <div className="flex justify-between text-amber-600">
                <span className="flex items-center gap-1">
                  Earmarks
                  <Tooltip>
                    <TooltipTrigger><Info className="h-3 w-3" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      ActBlue/WinRed pass-through contributions that appear as both receipt and disbursement
                    </TooltipContent>
                  </Tooltip>
                </span>
                <span>-{formatCurrency(earmarkPassThroughs)}</span>
              </div>
            )}
            <div className="flex justify-between font-medium">
              <span className="text-muted-foreground">Local Net:</span>
              <span>{formatCurrency(data.localNet)}</span>
            </div>
          </div>
          
          {/* FEC Data */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">FEC Itemized:</span>
              <span className="font-medium">{formatCurrency(data.fecItemized)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">FEC Unitemized:</span>
              <span>{formatCurrency(data.fecUnitemized)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">FEC Total Receipts:</span>
              <span>{formatCurrency(data.fecTotalReceipts)}</span>
            </div>
          </div>
          
          {/* Delta */}
          {data.deltaAmount !== null && data.deltaAmount !== undefined && data.deltaPct !== null && (
            <div className={cn(
              "flex justify-between pt-2 border-t border-border/50 font-medium",
              data.status === 'ok' ? 'text-agree' : 
              data.status === 'warning' ? 'text-amber-600' : 
              data.status === 'error' ? 'text-disagree' : ''
            )}>
              <span>Variance:</span>
              <span>
                {formatCurrency(data.deltaAmount)} ({data.deltaPct?.toFixed(1)}%)
              </span>
            </div>
          )}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <Card className={cn("shadow-sm", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            Finance Summary
          </CardTitle>
          {getStatusBadge(data.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <TooltipProvider>
          {/* Local Data Section */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Local Data</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-lg bg-secondary/50">
                <p className="text-xs text-muted-foreground">Gross</p>
                <p className="font-semibold">{formatCurrency(data.localGross)}</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  Net
                  <Tooltip>
                    <TooltipTrigger><Info className="h-3 w-3" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Excludes earmark pass-throughs for accurate comparison with FEC itemized
                    </TooltipContent>
                  </Tooltip>
                </p>
                <p className="font-semibold">{formatCurrency(data.localNet)}</p>
              </div>
            </div>
            {earmarkPassThroughs > 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {formatCurrency(earmarkPassThroughs)} in earmark pass-throughs excluded
              </p>
            )}
          </div>

          {/* FEC Data Section */}
          {hasFecData && (
            <div className="space-y-2 pt-2 border-t border-border">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">FEC Data</h4>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-secondary/50">
                  <p className="text-xs text-muted-foreground">Itemized</p>
                  <p className="font-semibold">{formatCurrency(data.fecItemized)}</p>
                </div>
                <div className="p-3 rounded-lg bg-secondary/50">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    Unitemized
                    <Tooltip>
                      <TooltipTrigger><Info className="h-3 w-3" /></TooltipTrigger>
                      <TooltipContent>Contributions under $200 not individually reported</TooltipContent>
                    </Tooltip>
                  </p>
                  <p className="font-semibold">{formatCurrency(data.fecUnitemized)}</p>
                </div>
                <div className="p-3 rounded-lg bg-secondary/50">
                  <p className="text-xs text-muted-foreground">Total Receipts</p>
                  <p className="font-semibold">{formatCurrency(data.fecTotalReceipts)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Variance Section */}
          {data.deltaAmount !== null && data.deltaAmount !== undefined && (
            <div className={cn(
              "p-3 rounded-lg border",
              data.status === 'ok' ? 'bg-agree/5 border-agree/20' : 
              data.status === 'warning' ? 'bg-amber-500/5 border-amber-500/20' : 
              data.status === 'error' ? 'bg-disagree/5 border-disagree/20' : 
              'bg-muted/50 border-border'
            )}>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Variance (Local Net vs FEC Itemized)</span>
                <span className={cn(
                  "font-semibold",
                  data.status === 'ok' ? 'text-agree' : 
                  data.status === 'warning' ? 'text-amber-600' : 
                  data.status === 'error' ? 'text-disagree' : ''
                )}>
                  {formatCurrency(data.deltaAmount)} ({data.deltaPct?.toFixed(1) ?? 0}%)
                </span>
              </div>
            </div>
          )}
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
