import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Play, Loader2, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface DonorSyncRun {
  id: string;
  scope: string;
  mode: string;
  started_at: string;
  finished_at: string | null;
  processed: number;
  success_count: number;
  failed_count: number;
  remaining: number | null;
  fec_ids_filled: number;
  triggered_by: string;
  errors: Array<{ step: string; message: string }>;
  notes: string | null;
}

export function AutomatedJobsCard() {
  const qc = useQueryClient();
  const [runningMode, setRunningMode] = useState<string | null>(null);

  const { data: runs, isLoading } = useQuery({
    queryKey: ['donor-sync-runs'],
    queryFn: async (): Promise<DonorSyncRun[]> => {
      const { data, error } = await supabase
        .from('donor_sync_runs')
        .select('*')
        .eq('scope', 'congress_visible')
        .order('started_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as DonorSyncRun[];
    },
    refetchInterval: 15000,
  });

  const latest = (mode: string) => runs?.find((r) => r.mode === mode) ?? null;
  const backfill = latest('backfill');
  const refresh = latest('refresh');

  const runNow = async (mode: 'backfill' | 'refresh') => {
    setRunningMode(mode);
    const toastId = toast.loading(`Running ${mode}…`);
    try {
      const { data, error } = await supabase.functions.invoke('schedule-congress-donor-sync', {
        body: { scope: 'congress_visible', mode, limit: mode === 'backfill' ? 10 : 25, cycle: '2024' },
      });
      if (error) throw error;
      const r = data as { syncResult?: { message?: string }; error?: string };
      toast.success(r?.syncResult?.message ?? `${mode} run complete`, { id: toastId });
      qc.invalidateQueries({ queryKey: ['donor-sync-runs'] });
    } catch (err) {
      toast.error(`${mode} failed: ${err instanceof Error ? err.message : 'Unknown error'}`, { id: toastId });
    } finally {
      setRunningMode(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Automated Jobs — Congress Donor Sync
        </CardTitle>
        <CardDescription>
          Auto-fills FEC donor data for visible-state House &amp; Senate candidates.
          Backfill runs every 10 minutes until the queue is empty; a full refresh runs daily at 07:00 UTC.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading runs…
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <JobBlock
              title="Backfill"
              schedule="Every 10 min"
              run={backfill}
              isRunning={runningMode === 'backfill'}
              onRunNow={() => runNow('backfill')}
            />
            <JobBlock
              title="Daily Refresh"
              schedule="07:00 UTC daily"
              run={refresh}
              isRunning={runningMode === 'refresh'}
              onRunNow={() => runNow('refresh')}
            />
          </div>
        )}

        {runs && runs.length > 0 && (
          <details className="rounded-lg border bg-muted/30 p-3 text-sm">
            <summary className="cursor-pointer font-medium">Recent run history ({runs.length})</summary>
            <div className="mt-2 space-y-1.5 text-xs">
              {runs.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2 border-b border-border/50 pb-1.5 last:border-0">
                  <Badge variant={r.mode === 'backfill' ? 'secondary' : 'outline'}>{r.mode}</Badge>
                  <span className="text-muted-foreground">
                    {formatDistanceToNow(new Date(r.started_at), { addSuffix: true })}
                  </span>
                  <span>✓ {r.success_count}</span>
                  {r.failed_count > 0 && <span className="text-destructive">✗ {r.failed_count}</span>}
                  {r.remaining !== null && (
                    <span className="text-muted-foreground">· {r.remaining} left</span>
                  )}
                  {r.fec_ids_filled > 0 && (
                    <span className="text-muted-foreground">· {r.fec_ids_filled} FEC IDs filled</span>
                  )}
                  <span className="text-muted-foreground ml-auto">{r.triggered_by}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function JobBlock({
  title, schedule, run, isRunning, onRunNow,
}: {
  title: string;
  schedule: string;
  run: DonorSyncRun | null;
  isRunning: boolean;
  onRunNow: () => void;
}) {
  const hasFailed = !!run && (run.failed_count > 0 || (run.notes && run.notes.length > 0));
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">{title}</p>
          <p className="text-xs text-muted-foreground">{schedule}</p>
        </div>
        <Button size="sm" variant="outline" onClick={onRunNow} disabled={isRunning}>
          {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          <span className="ml-1">Run now</span>
        </Button>
      </div>
      {run ? (
        <div className="text-xs space-y-1">
          <div className="flex items-center gap-1.5">
            {hasFailed ? (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            )}
            <span>
              Last run {formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}
            </span>
          </div>
          <div className="text-muted-foreground">
            Processed {run.processed} · Success {run.success_count}
            {run.failed_count > 0 && ` · Failed ${run.failed_count}`}
          </div>
          {run.remaining !== null && (
            <div className="flex items-center gap-1.5">
              <RefreshCw className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">{run.remaining} candidates remaining in queue</span>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No runs yet.</p>
      )}
    </div>
  );
}
