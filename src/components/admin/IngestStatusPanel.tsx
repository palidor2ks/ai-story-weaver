import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface IngestRow {
  source: string;
  status: string;
  last_started_at: string | null;
  last_completed_at: string | null;
  last_total_fetched: number | null;
  last_total_new: number | null;
  last_page: number | null;
  error_message: string | null;
  cursor: Record<string, unknown> | null;
  updated_at: string | null;
}

const REFRESH_MS = 15000;

function statusVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "error") return "destructive";
  if (status === "running") return "secondary";
  return "default";
}

function rel(ts: string | null): string {
  if (!ts) return "—";
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true });
  } catch {
    return ts;
  }
}

function sourceLabel(source: string): string {
  if (source === "fec") return "FEC discovery (federal)";
  if (source === "research-queue") return "Enrichment drainer";
  if (source.startsWith("ballot:")) return `Ballot ingest (${source.slice("ballot:".length)})`;
  return source;
}

function notes(r: IngestRow): string {
  if (r.error_message) return r.error_message;
  const c = (r.cursor ?? {}) as Record<string, unknown>;
  if (r.source === "fec" && c.pages) return `cursor: ${JSON.stringify(c.pages)}`;
  if (r.source === "research-queue" && c.remaining_pending != null) return `${c.remaining_pending} remaining in queue`;
  return "—";
}

export function IngestStatusPanel() {
  const qc = useQueryClient();

  const { data: rows, isLoading, isFetching } = useQuery({
    queryKey: ["candidate-ingest-status"],
    queryFn: async () => {
      // candidate_ingest_status isn't in the generated types yet, so cast the client.
      const { data, error } = await (supabase as any)
        .from("candidate_ingest_status")
        .select("*")
        .order("source");
      if (error) throw error;
      return (data ?? []) as IngestRow[];
    },
    refetchInterval: REFRESH_MS,
  });

  const { data: counts } = useQuery({
    queryKey: ["candidate-ingest-counts"],
    queryFn: async () => {
      const total = await supabase.from("candidates").select("id", { count: "exact", head: true });
      const pending = await supabase
        .from("candidates")
        .select("id", { count: "exact", head: true })
        .eq("answers_source", "pending_research");
      return { total: total.count ?? 0, pending: pending.count ?? 0 };
    },
    refetchInterval: REFRESH_MS,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["candidate-ingest-status"] });
    qc.invalidateQueries({ queryKey: ["candidate-ingest-counts"] });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" /> Discovery &amp; Enrichment Jobs
            </CardTitle>
            <CardDescription>
              Live status of the scheduled candidate pipeline. Auto-refreshes every {REFRESH_MS / 1000}s.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <div className="rounded-lg border px-4 py-2">
            <div className="text-2xl font-semibold">{counts?.total ?? "—"}</div>
            <div className="text-xs text-muted-foreground">Total candidates</div>
          </div>
          <div className="rounded-lg border px-4 py-2">
            <div className="text-2xl font-semibold">{counts?.pending ?? "—"}</div>
            <div className="text-xs text-muted-foreground">Pending research (enrichment backlog)</div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading job status…
          </div>
        ) : !rows || rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No job runs recorded yet. FEC discovery runs every 6h; the enrichment drainer every 30m.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead className="text-right">Fetched</TableHead>
                <TableHead className="text-right">New</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.source}>
                  <TableCell className="font-medium">{sourceLabel(r.source)}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                  </TableCell>
                  <TableCell title={r.last_completed_at ?? ""}>{rel(r.last_completed_at)}</TableCell>
                  <TableCell className="text-right">{r.last_total_fetched ?? 0}</TableCell>
                  <TableCell className="text-right">{r.last_total_new ?? 0}</TableCell>
                  <TableCell className="max-w-[22rem] truncate text-xs text-muted-foreground" title={notes(r)}>
                    {r.error_message ? <span className="text-destructive">{r.error_message}</span> : notes(r)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
