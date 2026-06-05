import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  Loader2,
  RefreshCw,
  Activity,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import {
  useCronJobHealth,
  useCronJobFailures,
  usePipelineFailureSummary,
  usePipelineFailures,
  type CronJobHealth,
} from "@/hooks/useCronHealth";

const SUCCESS_COLOR = "hsl(142 71% 45%)";
const FAIL_COLOR = "hsl(0 84% 60%)";

// Pipeline sources whose rep_id is a real candidate id we can link to.
const LINKABLE_SOURCES = new Set(["legislation_sync", "floor_votes_sync", "fec_reconciliation"]);

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "—";
  }
}

interface CronTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: CronJobHealth }>;
}

function CronTooltip({ active, payload }: CronTooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-medium mb-1">{row.jobname}</div>
      <div className="text-muted-foreground">{row.schedule}</div>
      <div className="mt-1 flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Attempts</span>
        <span className="font-medium">{row.totalRuns.toLocaleString()}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Failures</span>
        <span className={cn("font-medium", row.failed > 0 && "text-red-600")}>{row.failed.toLocaleString()}</span>
      </div>
    </div>
  );
}

/** Drill-down table of the individual reps that failed for one pipeline source. */
function RepFailureList({ source }: { source: string }) {
  const { data, isLoading } = usePipelineFailures(source);
  const linkable = LINKABLE_SOURCES.has(source);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data || data.length === 0) {
    return <div className="py-4 text-center text-xs text-muted-foreground">No failures recorded.</div>;
  }

  return (
    <div className="max-h-72 overflow-y-auto rounded-md border">
      <Table>
        <TableHeader className="sticky top-0 bg-muted/50">
          <TableRow>
            <TableHead className="h-8">Representative</TableHead>
            <TableHead className="h-8 w-12">St</TableHead>
            <TableHead className="h-8">Why it failed</TableHead>
            <TableHead className="h-8 w-28 text-right">When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((f, i) => (
            <TableRow key={`${f.repId}-${i}`}>
              <TableCell className="py-1.5 font-medium">
                {linkable ? (
                  <Link
                    to={`/candidate/${f.repId}`}
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    <span className="truncate max-w-[160px]">{f.repName}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </Link>
                ) : (
                  <span className="truncate max-w-[160px]">{f.repName}</span>
                )}
              </TableCell>
              <TableCell className="py-1.5 text-xs text-muted-foreground">{f.state || "—"}</TableCell>
              <TableCell className="py-1.5">
                <span className="text-xs text-muted-foreground line-clamp-2" title={f.reason || undefined}>
                  {f.reason || "—"}
                </span>
                {f.cycle && <span className="ml-1 text-[10px] text-muted-foreground">· cycle {f.cycle}</span>}
              </TableCell>
              <TableCell className="py-1.5 text-right text-xs text-muted-foreground whitespace-nowrap">
                {timeAgo(f.occurredAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Cron-level failed-run messages for one scheduled job. */
function CronFailureList({ jobname }: { jobname: string }) {
  const { data, isLoading } = useCronJobFailures(jobname);
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <div className="py-3 text-center text-xs text-muted-foreground">
        No cron-level failures — this job's runs all returned successfully. Downstream rep failures (if any)
        appear under “Representative-level failures” above.
      </div>
    );
  }
  return (
    <div className="max-h-60 overflow-y-auto space-y-1">
      {data.map((f) => (
        <div key={f.runid} className="rounded bg-background/70 border px-2 py-1.5 text-xs">
          <div className="flex items-center justify-between">
            <Badge variant="destructive" className="h-5 text-[10px]">
              {f.status}
            </Badge>
            <span className="text-muted-foreground">{timeAgo(f.startTime)}</span>
          </div>
          {f.returnMessage && (
            <div className="mt-1 font-mono text-[11px] text-destructive break-words">{f.returnMessage}</div>
          )}
        </div>
      ))}
    </div>
  );
}

export function CronHealthPanel() {
  const [open, setOpen] = useState(false);
  const { data: jobs, isLoading: jobsLoading, isFetching: jobsFetching, refetch: refetchJobs } = useCronJobHealth(7);
  const {
    data: failureSummary,
    isLoading: summaryLoading,
    isFetching: summaryFetching,
    refetch: refetchSummary,
  } = usePipelineFailureSummary();

  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  // Tallest chart bars first; cap label width by truncating in the axis tick.
  const chartData = useMemo(
    () => [...(jobs ?? [])].sort((a, b) => b.totalRuns - a.totalRuns),
    [jobs],
  );

  const cronFailures = useMemo(() => (jobs ?? []).reduce((s, j) => s + j.failed, 0), [jobs]);
  const repFailures = useMemo(
    () => (failureSummary ?? []).reduce((s, r) => s + r.failureCount, 0),
    [failureSummary],
  );
  const chartHeight = Math.max(180, (chartData.length || 1) * 22 + 24);

  const refreshAll = () => {
    refetchJobs();
    refetchSummary();
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 p-3">
        <CollapsibleTrigger className="flex items-center gap-2 text-left flex-1 min-w-0">
          <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          <Activity className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="text-sm font-medium">Pipeline &amp; Cron Health</div>
            <div className="text-xs text-muted-foreground truncate">
              Scheduled job attempts &amp; failures — drill into which representative failed and why
            </div>
          </div>
        </CollapsibleTrigger>

        <div className="flex items-center gap-2 shrink-0">
          {!summaryLoading && (
            <div className="hidden sm:flex items-center gap-1.5">
              <Badge
                variant="outline"
                className={cn("font-normal gap-1", repFailures > 0 ? "text-red-600 border-red-200" : "text-green-600 border-green-200")}
              >
                {repFailures > 0 ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                {repFailures.toLocaleString()} rep failures
              </Badge>
              {cronFailures > 0 && (
                <Badge variant="outline" className="font-normal text-red-600 border-red-200">
                  {cronFailures} cron failures
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
              refreshAll();
            }}
            disabled={jobsFetching || summaryFetching}
          >
            {jobsFetching || summaryFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      <CollapsibleContent>
        <div className="border-t p-3 space-y-5">
          {/* ── Representative-level failures (the drill-down) ── */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Representative-level failures
            </div>
            {summaryLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {(failureSummary ?? []).map((s) => {
                    const isActive = selectedSource === s.source;
                    const hasFailures = s.failureCount > 0;
                    return (
                      <button
                        key={s.source}
                        type="button"
                        disabled={!hasFailures}
                        onClick={() => setSelectedSource(isActive ? null : s.source)}
                        className={cn(
                          "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                          !hasFailures && "opacity-60 cursor-default",
                          isActive ? "border-primary bg-primary/5" : hasFailures && "hover:bg-muted/60",
                        )}
                      >
                        <span className="font-medium">{s.label}</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "h-5 text-[10px]",
                            hasFailures ? "text-red-600 border-red-200" : "text-green-600 border-green-200",
                          )}
                        >
                          {s.failureCount.toLocaleString()}
                        </Badge>
                      </button>
                    );
                  })}
                </div>

                {selectedSource && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Showing failed reps for{" "}
                        <span className="font-medium text-foreground">
                          {failureSummary?.find((s) => s.source === selectedSource)?.label}
                        </span>
                      </span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setSelectedSource(null)}>
                        <X className="h-3 w-3 mr-1" />
                        Close
                      </Button>
                    </div>
                    <RepFailureList source={selectedSource} />
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Scheduled jobs chart ── */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Scheduled jobs · attempts &amp; failures (last 7 days)
            </div>
            {jobsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : chartData.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">No cron run history.</div>
            ) : (
              <>
                <div style={{ height: chartHeight }} className="w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={chartData}
                      margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
                      barCategoryGap={4}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
                      <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                      <YAxis
                        type="category"
                        dataKey="jobname"
                        width={150}
                        tickLine={false}
                        axisLine={false}
                        fontSize={10}
                        tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
                      />
                      <Tooltip content={<CronTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                      <Bar dataKey="succeeded" name="Succeeded" stackId="runs" fill={SUCCESS_COLOR} radius={[2, 0, 0, 2]} />
                      <Bar dataKey="failed" name="Failed" stackId="runs" fill={FAIL_COLOR} radius={[0, 2, 2, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-8">Job</TableHead>
                        <TableHead className="h-8">Schedule</TableHead>
                        <TableHead className="h-8 text-right">Attempts</TableHead>
                        <TableHead className="h-8 text-right">Failures</TableHead>
                        <TableHead className="h-8 text-right">Last run</TableHead>
                        <TableHead className="h-8 w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(jobs ?? []).map((j) => {
                        const isExpanded = expandedJob === j.jobname;
                        return (
                          <Fragment key={j.jobname}>
                            <TableRow
                              className={cn(j.failed > 0 && "cursor-pointer")}
                              onClick={() => j.failed > 0 && setExpandedJob(isExpanded ? null : j.jobname)}
                            >
                              <TableCell className="py-1.5 font-medium">
                                <span className="flex items-center gap-1.5">
                                  {!j.active && <span className="text-[10px] text-muted-foreground">(paused)</span>}
                                  {j.jobname}
                                </span>
                              </TableCell>
                              <TableCell className="py-1.5 font-mono text-[11px] text-muted-foreground">
                                {j.schedule}
                              </TableCell>
                              <TableCell className="py-1.5 text-right tabular-nums">
                                {j.totalRuns.toLocaleString()}
                              </TableCell>
                              <TableCell className="py-1.5 text-right tabular-nums">
                                {j.failed > 0 ? (
                                  <span className="font-medium text-red-600">{j.failed.toLocaleString()}</span>
                                ) : (
                                  <span className="text-muted-foreground">0</span>
                                )}
                              </TableCell>
                              <TableCell className="py-1.5 text-right text-xs text-muted-foreground whitespace-nowrap">
                                {timeAgo(j.lastRun)}
                              </TableCell>
                              <TableCell className="py-1.5 text-right">
                                {j.failed > 0 && (
                                  <ChevronRight
                                    className={cn(
                                      "h-3.5 w-3.5 text-muted-foreground transition-transform",
                                      isExpanded && "rotate-90",
                                    )}
                                  />
                                )}
                              </TableCell>
                            </TableRow>
                            {isExpanded && (
                              <TableRow>
                                <TableCell colSpan={6} className="bg-muted/30 p-2">
                                  <CronFailureList jobname={j.jobname} />
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
