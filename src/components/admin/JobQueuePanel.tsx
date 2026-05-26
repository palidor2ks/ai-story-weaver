import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type JobStatus = "pending" | "running" | "done" | "failed" | "dead";

interface JobRow {
  id: string;
  job_type: string;
  status: JobStatus;
  priority: number;
  attempts: number;
  max_attempts: number;
  payload: any;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  locked_by: string | null;
  locked_at: string | null;
}

const STATUS_VARIANT: Record<JobStatus, { variant: "default" | "secondary" | "destructive" | "outline"; cls: string }> = {
  pending: { variant: "secondary", cls: "" },
  running: { variant: "default", cls: "bg-blue-600" },
  done: { variant: "outline", cls: "text-green-600 border-green-300" },
  failed: { variant: "destructive", cls: "" },
  dead: { variant: "outline", cls: "text-muted-foreground" },
};

export function JobQueuePanel() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<JobStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: jobs, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-job-queue", statusFilter, typeFilter],
    queryFn: async (): Promise<JobRow[]> => {
      let q = supabase
        .from("job_queue")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (typeFilter !== "all") q = q.eq("job_type", typeFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as JobRow[];
    },
    refetchInterval: 5000,
  });

  const cancelMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("cancel_job", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Job cancelled");
      qc.invalidateQueries({ queryKey: ["admin-job-queue"] });
    },
    onError: (e: any) => toast.error(`Cancel failed: ${e.message}`),
  });

  const retryMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("retry_job", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Job requeued");
      qc.invalidateQueries({ queryKey: ["admin-job-queue"] });
    },
    onError: (e: any) => toast.error(`Retry failed: ${e.message}`),
  });

  const jobTypes = Array.from(new Set((jobs ?? []).map((j) => j.job_type)));

  const counts = (jobs ?? []).reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Background Job Queue</CardTitle>
            <CardDescription>
              Live view of worker jobs. Auto-refreshes every 5s.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          {(["pending", "running", "done", "failed", "dead"] as JobStatus[]).map((s) => (
            <Badge key={s} variant={STATUS_VARIANT[s].variant} className={STATUS_VARIANT[s].cls}>
              {s}: {counts[s] ?? 0}
            </Badge>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 pt-3">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="done">Done</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="dead">Dead</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All job types</SelectItem>
              {jobTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : !jobs || jobs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">No jobs match the current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Worker</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => {
                  const cfg = STATUS_VARIANT[j.status];
                  const isOpen = expanded === j.id;
                  return (
                    <>
                      <TableRow key={j.id} className="cursor-pointer" onClick={() => setExpanded(isOpen ? null : j.id)}>
                        <TableCell className="font-mono text-xs">{j.job_type}</TableCell>
                        <TableCell>
                          <Badge variant={cfg.variant} className={cfg.cls}>{j.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {j.attempts}/{j.max_attempts}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(j.created_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(j.updated_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="text-xs font-mono truncate max-w-[120px]">
                          {j.locked_by ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            {(j.status === "failed" || j.status === "dead" || j.status === "done") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => retryMut.mutate(j.id)}
                                disabled={retryMut.isPending}
                                title="Requeue job"
                              >
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                            )}
                            {(j.status === "pending" || j.status === "running" || j.status === "failed") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => cancelMut.mutate(j.id)}
                                disabled={cancelMut.isPending}
                                title="Cancel job"
                              >
                                <XCircle className="h-3 w-3 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow key={`${j.id}-detail`} className="bg-muted/30">
                          <TableCell colSpan={7}>
                            <div className="space-y-2 py-2 text-xs">
                              <div>
                                <span className="font-semibold">ID:</span>{" "}
                                <span className="font-mono">{j.id}</span>
                              </div>
                              <div>
                                <span className="font-semibold">Payload:</span>
                                <pre className="mt-1 p-2 bg-background rounded border overflow-x-auto">
                                  {JSON.stringify(j.payload, null, 2)}
                                </pre>
                              </div>
                              {j.last_error && (
                                <div>
                                  <span className="font-semibold text-destructive">Last error:</span>
                                  <pre className="mt-1 p-2 bg-destructive/5 text-destructive rounded border border-destructive/20 overflow-x-auto whitespace-pre-wrap">
                                    {j.last_error}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
