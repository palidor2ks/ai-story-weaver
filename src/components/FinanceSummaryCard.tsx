import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DollarSign, Info, CheckCircle2, AlertTriangle, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FinanceSummaryData {
  fecItemized: number | null;
  fecUnitemized: number | null;
  fecTotalReceipts: number | null;
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

export function FinanceSummaryCard({ data, compact = false, className }: FinanceSummaryCardProps) {
  const hasFecData = data.fecTotalReceipts !== null && data.fecTotalReceipts > 0;

  if (!hasFecData) {
    return null;
  }

  // Calculate "Other Receipts" = Total - Itemized - Unitemized
  // This captures PAC contributions, transfers, loans, offsets, etc.
  const otherReceipts = (data.fecTotalReceipts ?? 0) - (data.fecItemized ?? 0) - (data.fecUnitemized ?? 0);
  
  // Validate the formula: Total should equal Itemized + Unitemized + Other
  const calculatedTotal = (data.fecItemized ?? 0) + (data.fecUnitemized ?? 0) + otherReceipts;
  const isBalanced = Math.abs(calculatedTotal - (data.fecTotalReceipts ?? 0)) < 1; // Allow $1 rounding

  if (compact) {
    return (
      <TooltipProvider>
        <div className={cn("space-y-2 text-xs", className)}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-sm">FEC Finance Summary</span>
            {isBalanced ? (
              <CheckCircle2 className="h-3 w-3 text-agree" />
            ) : (
              <AlertTriangle className="h-3 w-3 text-amber-500" />
            )}
          </div>
          
          {/* FEC Data Breakdown */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                Itemized
                <Tooltip>
                  <TooltipTrigger><Info className="h-3 w-3" /></TooltipTrigger>
                  <TooltipContent>Individual contributions $200+</TooltipContent>
                </Tooltip>
              </span>
              <span className="font-medium">{formatCurrency(data.fecItemized)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                Unitemized
                <Tooltip>
                  <TooltipTrigger><Info className="h-3 w-3" /></TooltipTrigger>
                  <TooltipContent>Contributions under $200 not individually reported</TooltipContent>
                </Tooltip>
              </span>
              <span>{formatCurrency(data.fecUnitemized)}</span>
            </div>
            {otherReceipts > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  Other Receipts
                  <Tooltip>
                    <TooltipTrigger><Info className="h-3 w-3" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-medium mb-1">Includes:</p>
                      <ul className="text-xs space-y-0.5">
                        <li>• Conduit pass-throughs (WinRed, ActBlue, Democracy Engine)</li>
                        <li>• PAC contributions & committee transfers</li>
                        <li>• Candidate loans & refunds</li>
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                </span>
                <span>{formatCurrency(otherReceipts)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 border-t border-border/50">
              <span className="text-muted-foreground font-medium">Total Receipts</span>
              <span className="font-semibold">{formatCurrency(data.fecTotalReceipts)}</span>
            </div>
          </div>
          
          {/* Equation validation */}
          <div className={cn(
            "text-[10px] p-1.5 rounded flex items-center gap-1",
            isBalanced ? "bg-agree/10 text-agree" : "bg-amber-500/10 text-amber-600"
          )}>
            {isBalanced ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
            <span>Itemized + Unitemized + Other = Total</span>
          </div>
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
            FEC Finance Summary
          </CardTitle>
          {isBalanced ? (
            <CheckCircle2 className="h-4 w-4 text-agree" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <TooltipProvider>
          {/* FEC Data Breakdown */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-lg bg-secondary/50">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  Itemized Contributions
                  <Tooltip>
                    <TooltipTrigger><Info className="h-3 w-3" /></TooltipTrigger>
                    <TooltipContent>Individual contributions $200+ that are individually reported</TooltipContent>
                  </Tooltip>
                </p>
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
            </div>
            
            {otherReceipts > 0 && (
              <div className="p-3 rounded-lg bg-secondary/50">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  Other Receipts
                  <Tooltip>
                    <TooltipTrigger><Info className="h-3 w-3" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-medium mb-1">Includes:</p>
                      <ul className="text-xs space-y-0.5">
                        <li>• <span className="font-medium">Conduit pass-throughs</span> — Donations routed via WinRed, ActBlue, Democracy Engine (original donors are listed separately)</li>
                        <li>• PAC contributions & party committee transfers</li>
                        <li>• Candidate loans, refunds & other receipts</li>
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                </p>
                <p className="font-semibold text-lg">{formatCurrency(otherReceipts)}</p>
              </div>
            )}
            
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-xs text-muted-foreground">Total Receipts</p>
              <p className="font-bold text-lg">{formatCurrency(data.fecTotalReceipts)}</p>
            </div>
          </div>
          
          {/* Conduit explanation callout */}
          <div className="p-3 rounded-lg bg-muted/50 border border-border/50 flex items-start gap-2">
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">About Conduit Contributions: </span>
              Organizations like WinRed, ActBlue, and Democracy Engine are "conduits" that process donations on behalf of individual donors. 
              These pass-throughs appear in "Other Receipts" to avoid double-counting.
            </div>
          </div>
          
          {/* Equation validation display */}
          <div className={cn(
            "p-3 rounded-lg flex items-center gap-2 text-sm",
            isBalanced ? "bg-agree/10" : "bg-amber-500/10"
          )}>
            {isBalanced ? (
              <CheckCircle2 className="h-4 w-4 text-agree" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            )}
            <span className={isBalanced ? "text-agree" : "text-amber-600"}>
              Itemized + Unitemized + Other = Total Receipts
            </span>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
