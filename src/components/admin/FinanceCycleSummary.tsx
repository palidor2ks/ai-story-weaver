import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChevronRight, Loader2, RefreshCw, TrendingDown, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFinanceCycleSummary, type FinanceCycleSummaryRow } from "@/hooks/useFinanceCycleSummary";

function fmtCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "")}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs)}`;
}

const FEC_COLOR = "hsl(217 91% 60%)"; // blue
const LOCAL_COLOR = "hsl(142 71% 45%)"; // green

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: FinanceCycleSummaryRow }>;
  label?: string | number;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const coverage = row.fecTotal > 0 ? Math.round((row.localTotal / row.fecTotal) * 100) : 0;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-medium mb-1">Cycle {label}</div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">FEC totals</span>
        <span className="font-medium">{fmtCurrency(row.fecTotal)}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Local imported</span>
        <span className="font-medium">{fmtCurrency(row.localTotal)}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Delta</span>
        <span className={cn("font-medium", row.delta < 0 ? "text-amber-600" : "text-green-600")}>
          {fmtCurrency(row.delta)}
        </span>
      </div>
      <div className="mt-1 pt-1 border-t text-muted-foreground">{coverage}% of FEC imported locally</div>
    </div>
  );
}

export function FinanceCycleSummary() {
  const { data, isLoading, isFetching, refetch } = useFinanceCycleSummary();
  const [open, setOpen] = useState(false);

  const rows = useMemo(() => data ?? [], [data]);
  const chartData = useMemo(() => [...rows].reverse(), [rows]); // oldest → newest left to right

  // Headline numbers shown even while collapsed.
  const totals = useMemo(() => {
    const fec = rows.reduce((s, r) => s + r.fecTotal, 0);
    const local = rows.reduce((s, r) => s + r.localTotal, 0);
    const errors = rows.reduce((s, r) => s + r.errorCount, 0);
    return { fec, local, delta: local - fec, errors };
  }, [rows]);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-lg border bg-card"
    >
      <div className="flex items-center justify-between gap-2 p-3">
        <CollapsibleTrigger className="flex items-center gap-2 text-left flex-1 min-w-0">
          <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          <DollarSign className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="text-sm font-medium">Finance Coverage by Cycle</div>
            <div className="text-xs text-muted-foreground truncate">
              FEC vs locally-imported receipt totals across visible states — how much is left to reconcile
            </div>
          </div>
        </CollapsibleTrigger>

        <div className="flex items-center gap-2 shrink-0">
          {!isLoading && rows.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs">
              <Badge variant="outline" className="font-normal gap-1">
                <TrendingDown className="h-3 w-3 text-amber-600" />
                {fmtCurrency(totals.delta)} gap
              </Badge>
              {totals.errors > 0 && (
                <Badge variant="outline" className="font-normal text-red-600 border-red-200">
                  {totals.errors.toLocaleString()} errors
                </Badge>
              )}
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              refetch();
            }}
            disabled={isFetching}
          >
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      <CollapsibleContent>
        <div className="border-t p-3 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">No reconciliation data yet.</div>
          ) : (
            <>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 16, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                    <XAxis dataKey="cycle" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickFormatter={(v) => fmtCurrency(Number(v))} tickLine={false} axisLine={false} fontSize={11} width={48} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                    <Legend
                      formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
                    />
                    <Bar dataKey="fecTotal" name="FEC totals" fill={FEC_COLOR} radius={[3, 3, 0, 0]} maxBarSize={48} />
                    <Bar dataKey="localTotal" name="Local imported" fill={LOCAL_COLOR} radius={[3, 3, 0, 0]} maxBarSize={48}>
                      <LabelList
                        dataKey="localTotal"
                        position="top"
                        formatter={(v: number) => fmtCurrency(v)}
                        className="fill-muted-foreground"
                        fontSize={10}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cycle</TableHead>
                      <TableHead className="text-right">Reps</TableHead>
                      <TableHead className="text-right">FEC Totals</TableHead>
                      <TableHead className="text-right">Local</TableHead>
                      <TableHead className="text-right">Delta</TableHead>
                      <TableHead className="w-[160px]">Imported</TableHead>
                      <TableHead className="text-right">Reconciled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const coverage = r.fecTotal > 0 ? Math.min(100, Math.round((r.localTotal / r.fecTotal) * 100)) : 0;
                      return (
                        <TableRow key={r.cycle}>
                          <TableCell className="font-medium">{r.cycle}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.reps.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtCurrency(r.fecTotal)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtCurrency(r.localTotal)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className={cn("font-medium", r.delta < 0 ? "text-amber-600" : "text-green-600")}>
                              {fmtCurrency(r.delta)}
                            </span>
                            {r.deltaPct !== null && (
                              <span className="text-muted-foreground text-xs"> ({r.deltaPct > 0 ? "+" : ""}{r.deltaPct.toFixed(0)}%)</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={coverage} className="h-1.5 flex-1" />
                              <span className="text-xs text-muted-foreground w-9 text-right tabular-nums">{coverage}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {r.errorCount > 0 && (
                                <Badge variant="outline" className="text-[10px] h-5 text-red-600 border-red-200">
                                  {r.errorCount} err
                                </Badge>
                              )}
                              {r.warningCount > 0 && (
                                <Badge variant="outline" className="text-[10px] h-5 text-amber-600 border-amber-200">
                                  {r.warningCount} warn
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-[10px] h-5 text-green-600 border-green-200">
                                {r.okCount} ok
                              </Badge>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                "Local" mirrors the dashboard's per-row Local total (imported itemized receipts plus FEC-only
                lines we can't import). A large negative delta or error count means more receipt syncing is
                needed for that cycle.
              </p>
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
