import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Brain, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

type BackfillProgress = {
  status: "running" | "complete" | "error" | "cancelled";
  processed: number;
  total: number;
  successful: number;
  failed: number;
  currentCandidate?: string;
  startedAt?: string;
  completedAt?: string;
  elapsedMinutes?: number;
  error?: string;
  failures?: { id: string; name: string; error: string }[];
};

export function BackfillAnswersControl() {
  const [showFailures, setShowFailures] = useState(false);

  const { data: progress } = useQuery({
    queryKey: ["backfill-answers-progress"],
    queryFn: async (): Promise<BackfillProgress | null> => {
      const { data } = await supabase
        .from("admin_stats_cache")
        .select("stat_value")
        .eq("stat_key", "backfill_answers_progress")
        .maybeSingle();
      return (data?.stat_value as BackfillProgress) ?? null;
    },
    refetchInterval: (q) => {
      const v = q.state.data as BackfillProgress | null;
      return v?.status === "running" ? 5000 : 30000;
    },
  });

  const isRunning = progress?.status === "running";
  const pct = progress && progress.total > 0
    ? Math.round((progress.processed / progress.total) * 100)
    : 0;

  const startBackfill = async () => {
    const { data, error } = await supabase.functions.invoke("batch-regenerate-answers", {
      body: { visibleStatesOnly: true, batchSize: 5, delayBetweenCandidates: 3000 },
    });
    if (error) {
      toast.error("Failed to start backfill", { description: error.message });
    } else {
      toast.success("Backfill started", { description: "Progress will appear below." });
      console.log("batch-regenerate-answers started", data);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={isRunning}>
            {isRunning ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Backfill running...</>
            ) : (
              <><Brain className="h-4 w-4 mr-2" />Backfill Answers (Visible States)</>
            )}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Backfill missing answers for visible states?</AlertDialogTitle>
            <AlertDialogDescription>
              Iterates every politician whose state is NOT in hidden_states and fills any missing question answers (rep by rep, all topics covered per rep). Skips reps already at full coverage. Runs in background — may take hours.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={startBackfill}>Start Backfill</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {progress && (
        <div className="rounded-md border bg-card p-3 text-sm space-y-2 min-w-[320px]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-medium">Backfill</span>
              <Badge
                variant={
                  progress.status === "running"
                    ? "secondary"
                    : progress.status === "complete"
                    ? "default"
                    : "destructive"
                }
              >
                {progress.status}
              </Badge>
            </div>
            <span className="text-muted-foreground text-xs">
              {progress.processed}/{progress.total} ({pct}%)
            </span>
          </div>

          <Progress value={pct} className="h-2" />

          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> {progress.successful} success
            </span>
            <span className="flex items-center gap-1 text-destructive">
              <XCircle className="h-3.5 w-3.5" /> {progress.failed} failed
            </span>
            {progress.elapsedMinutes != null && (
              <span className="text-muted-foreground">{progress.elapsedMinutes} min</span>
            )}
          </div>

          {isRunning && progress.currentCandidate && (
            <div className="text-xs text-muted-foreground truncate">
              Now: {progress.currentCandidate}
            </div>
          )}

          {progress.status === "error" && progress.error && (
            <div className="text-xs text-destructive">Error: {progress.error}</div>
          )}

          {progress.failures && progress.failures.length > 0 && (
            <div className="pt-1 border-t">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowFailures((s) => !s)}
              >
                {showFailures ? "Hide" : "Show"} recent failures ({progress.failures.length})
              </button>
              {showFailures && (
                <ul className="mt-1 space-y-1 max-h-40 overflow-auto text-xs">
                  {progress.failures.map((f) => (
                    <li key={f.id} className="truncate">
                      <span className="font-medium">{f.name}</span>
                      <span className="text-muted-foreground"> — {f.error}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
