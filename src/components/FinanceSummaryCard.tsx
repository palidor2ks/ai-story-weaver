import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DollarSign, Info } from "lucide-react";
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

  if (compact) {
    return (
      <TooltipProvider>
        <div className={cn("space-y-2 text-xs", className)}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-sm">FEC Finance Summary</span>
          </div>
          
          {/* FEC Data */}
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
                      PAC contributions, committee transfers, loans, refunds, and other receipts
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
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <TooltipProvider>
          {/* FEC Data Section */}
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
                  Other Committee Contributions
                  <Tooltip>
                    <TooltipTrigger><Info className="h-3 w-3" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      PAC contributions, party committee transfers, candidate loans, refunds, and other receipts not included in itemized/unitemized individual contributions
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
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
