import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose,
} from '@/components/ui/drawer';
import { Clock, Play, Loader2, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

type RunState = 'queued' | 'running' | 'partial' | 'completed' | 'error' | 'unknown';

function deriveRunState(run: DonorSyncRun | null | undefined): RunState {
  if (!run) return 'unknown';
  const notes = (run.notes ?? '').toLowerCase();
  if (!run.finished_at) {
    if (run.processed === 0 && run.success_count === 0 && run.failed_count === 0) return 'queued';
    return 'running';
  }
  if (notes.startsWith('error')) return 'error';
  if (notes.startsWith('partial')) return 'partial';
  if (run.failed_count > 0 && run.success_count === 0) return 'error';
  return 'completed';
}

const RUN_STATE_META: Record<RunState, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
  queued:    { label: 'Queued',    variant: 'outline' },
  running:   { label: 'Running',   variant: 'secondary' },
  partial:   { label: 'Partial',   variant: 'outline', className: 'border-amber-500 text-amber-700' },
  completed: { label: 'Completed', variant: 'secondary', className: 'border-green-500 text-green-700' },
  error:     { label: 'Error',     variant: 'destructive' },
  unknown:   { label: 'Unknown',   variant: 'outline' },
};

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

interface CandidateResult {
  candidateId: string;
  name: string;
  state: string | null;
  office: string | null;
  fecCandidateId: string | null;
  status: 'success' | 'failed';
  imported: number;
  totalRaised: number;
  durationMs: number;
  error?: string;
  previousSync: string | null;
}

interface MissingFec {
  id: string;
  name: string;
  state: string | null;
  office: string | null;
  attempted: boolean;
  filled?: boolean;
  error?: string;
}

interface RunDiagnostics {
  mode: string;
  ranAt: string;
  ok: boolean;
  error: string | null;
  fecIdsFilled: number;
  missingFec: MissingFec[];
  missingFecCount: number;
  processed: number;
  successCount: number;
  failedCount: number;
  totalDonorsImported: number;
  totalRaised: number;
  remaining: number | null;
  candidates: CandidateResult[];
  errors: string[];
}

interface RunError {
  mode: string;
  ranAt: string;
  message: string;
  name?: string;
  status?: number | string;
  context?: unknown;
  raw?: unknown;
  advice: string[];
}

function buildAdvice(message: string, status?: number | string): string[] {
  const tips: string[] = [];
  const m = message.toLowerCase();
  if (typeof status === 'number' && status >= 500) {
    tips.push('The edge function crashed (5xx). Check the schedule-congress-donor-sync logs in Supabase for the stack trace.');
  }
  if (m.includes('fetch') && m.includes('failed')) {
    tips.push('Network call from the browser to the edge function failed. Confirm you are signed in and the function is deployed.');
  }
  if (m.includes('timeout') || m.includes('timed out')) {
    tips.push('Run took longer than the 150s edge timeout. Lower the batch limit or rerun — progress is checkpointed.');
  }
  if (m.includes('worker_limit') || m.includes('546')) {
    tips.push('Edge worker limit hit. Wait a minute and rerun with a smaller limit.');
  }
  if (m.includes('jwt') || m.includes('unauthorized') || status === 401) {
    tips.push('Auth token rejected. Refresh the page to renew your session, then retry.');
  }
  if (m.includes('fec_api_key') || m.includes('fec api')) {
    tips.push('FEC_API_KEY secret missing or invalid. Set it in Lovable Cloud secrets.');
  }
  if (m.includes('rpc') || m.includes('relation') || m.includes('column')) {
    tips.push('Database error — a migration may be missing. Check recent migrations for donor_sync_runs/queue tables.');
  }
  if (tips.length === 0) {
    tips.push('Open the schedule-congress-donor-sync function logs for the matching timestamp to see the full server-side error.');
  }
  return tips;
}

export function AutomatedJobsCard() {
  const qc = useQueryClient();
  const [runningMode, setRunningMode] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<RunDiagnostics | null>(null);
  const [runError, setRunError] = useState<RunError | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [statusDrawerOpen, setStatusDrawerOpen] = useState(false);

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
    setDiagnostics(null);
    setRunError(null);
    const toastId = toast.loading(`Running ${mode}…`);
    try {
      const { data, error } = await supabase.functions.invoke('schedule-congress-donor-sync', {
        body: { scope: 'congress_visible', mode, limit: mode === 'backfill' ? 2 : 3, cycle: '2024' },
      });
      if (error) {
        // Try to extract the server response body for a better message
        let bodyText: string | undefined;
        let status: number | undefined;
        const ctx = (error as unknown as { context?: { response?: Response } }).context;
        if (ctx?.response) {
          status = ctx.response.status;
          try { bodyText = await ctx.response.clone().text(); } catch { /* ignore */ }
        }
        let parsed: unknown = bodyText;
        if (bodyText) { try { parsed = JSON.parse(bodyText); } catch { /* keep text */ } }
        const serverMsg = (parsed && typeof parsed === 'object' && 'error' in (parsed as Record<string, unknown>))
          ? String((parsed as Record<string, unknown>).error)
          : (typeof parsed === 'string' && parsed.length > 0 ? parsed : error.message);
        throw Object.assign(new Error(serverMsg), { name: error.name, status, context: parsed ?? null });
      }
      const r = data as {
        ok: boolean;
        queued?: boolean;
        runId?: string;
        error: string | null;
        fecIdsFilled: number;
        missingFec: MissingFec[];
        missingFecCount: number;
        syncResult: {
          message?: string;
          processed?: number;
          successCount?: number;
          failedCount?: number;
          totalDonorsImported?: number;
          totalRaised?: number;
          remaining?: number | null;
          candidates?: CandidateResult[];
          errors?: string[];
        };
      };

      // Background pattern: the function returns immediately with queued=true.
      // Real results land in donor_sync_runs and the 15s poll picks them up.
      if (r.queued) {
        if (r.runId) {
          setActiveRunId(r.runId);
          setStatusDrawerOpen(true);
        }
        toast.success('Run queued — watch the status drawer for live progress.', { id: toastId });
        qc.invalidateQueries({ queryKey: ['donor-sync-runs'] });
        return;
      }

      const s = r.syncResult ?? {};
      setDiagnostics({
        mode,
        ranAt: new Date().toISOString(),
        ok: r.ok,
        error: r.error,
        fecIdsFilled: r.fecIdsFilled ?? 0,
        missingFec: r.missingFec ?? [],
        missingFecCount: r.missingFecCount ?? 0,
        processed: s.processed ?? 0,
        successCount: s.successCount ?? 0,
        failedCount: s.failedCount ?? 0,
        totalDonorsImported: s.totalDonorsImported ?? 0,
        totalRaised: s.totalRaised ?? 0,
        remaining: s.remaining ?? null,
        candidates: s.candidates ?? [],
        errors: s.errors ?? [],
      });
      if (!r.ok || r.error) {
        const msg = r.error ?? 'Run returned ok=false with no error message.';
        setRunError({
          mode,
          ranAt: new Date().toISOString(),
          message: msg,
          context: r,
          advice: buildAdvice(msg),
        });
        toast.error(`${mode} reported a failure`, { id: toastId });
      } else {
        toast.success(s.message ?? `${mode} run complete`, { id: toastId });
      }
      qc.invalidateQueries({ queryKey: ['donor-sync-runs'] });
    } catch (err) {
      const e = err as { message?: string; name?: string; status?: number | string; context?: unknown };
      const message = e.message ?? 'Unknown error';
      setRunError({
        mode,
        ranAt: new Date().toISOString(),
        message,
        name: e.name,
        status: e.status,
        context: e.context,
        raw: err,
        advice: buildAdvice(message, e.status),
      });
      toast.error(`${mode} failed: ${message}`, { id: toastId });
    } finally {
      setRunningMode(null);
    }
  };

  const activeRun = useMemo(
    () => (activeRunId ? runs?.find((r) => r.id === activeRunId) ?? null : null),
    [activeRunId, runs],
  );

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Automated Jobs — Congress Donor Sync
            </CardTitle>
            <CardDescription>
              Auto-fills FEC donor data for visible-state House &amp; Senate candidates.
              Backfill runs every 10 minutes until the queue is empty; a full refresh runs daily at 07:00 UTC.
            </CardDescription>
          </div>
          {activeRunId && (
            <Button size="sm" variant="outline" onClick={() => setStatusDrawerOpen(true)}>
              <Activity className="h-3.5 w-3.5 mr-1" />
              Run status
            </Button>
          )}
        </div>
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

        {runError && <ErrorPanel e={runError} onDismiss={() => setRunError(null)} />}
        {diagnostics && <DiagnosticsPanel d={diagnostics} onDismiss={() => setDiagnostics(null)} />}

        {runs && runs.length > 0 && (
          <details className="rounded-lg border bg-muted/30 p-3 text-sm">
            <summary className="cursor-pointer font-medium">Recent run history ({runs.length})</summary>
            <div className="mt-2 space-y-1.5 text-xs">
              {runs.map((r) => {
                const state = deriveRunState(r);
                const meta = RUN_STATE_META[state];
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => { setActiveRunId(r.id); setStatusDrawerOpen(true); }}
                    className="flex w-full flex-wrap items-center gap-2 border-b border-border/50 pb-1.5 last:border-0 text-left hover:bg-muted/50 rounded px-1 -mx-1"
                  >
                    <Badge variant={r.mode === 'backfill' ? 'secondary' : 'outline'}>{r.mode}</Badge>
                    <Badge variant={meta.variant} className={meta.className}>{meta.label}</Badge>
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
                  </button>
                );
              })}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
    <RunStatusDrawer
      open={statusDrawerOpen}
      onOpenChange={setStatusDrawerOpen}
      runId={activeRunId}
      run={activeRun}
    />
    </>
  );
}

function RunStatusDrawer({
  open, onOpenChange, runId, run,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  runId: string | null;
  run: DonorSyncRun | null;
}) {
  const state = deriveRunState(run);
  const meta = RUN_STATE_META[state];
  const copyRunId = () => {
    if (!runId) return;
    navigator.clipboard?.writeText(runId).then(() => toast.success('Run ID copied'));
  };
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Run status
            <Badge variant={meta.variant} className={meta.className}>{meta.label}</Badge>
            {run && !run.finished_at && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </DrawerTitle>
          <DrawerDescription>
            Live status for the most recent Run now execution. Auto-refreshes every 15 seconds.
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-2 space-y-3 text-sm max-h-[60vh] overflow-y-auto">
          <div className="rounded-md border bg-muted/30 p-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Run ID</div>
              <div className="font-mono text-xs truncate">{runId ?? '—'}</div>
            </div>
            <Button size="sm" variant="outline" onClick={copyRunId} disabled={!runId}>Copy</Button>
          </div>

          {run ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Stat label="Mode" value={run.mode} />
                <Stat label="Processed" value={run.processed} />
                <Stat label="Success" value={run.success_count} accent="text-green-600" />
                <Stat label="Failed" value={run.failed_count} accent={run.failed_count > 0 ? 'text-destructive' : ''} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <Stat label="Remaining" value={run.remaining ?? '—'} />
                <Stat label="FEC IDs filled" value={run.fec_ids_filled} />
                <Stat label="Triggered by" value={run.triggered_by} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Stat
                  label="Started"
                  value={formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}
                />
                <Stat
                  label="Finished"
                  value={run.finished_at ? formatDistanceToNow(new Date(run.finished_at), { addSuffix: true }) : '—'}
                />
              </div>
              <div className="rounded-md border bg-background p-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Notes</div>
                <div className="text-xs whitespace-pre-wrap break-words">
                  {run.notes ?? <span className="italic text-muted-foreground">No notes yet.</span>}
                </div>
              </div>
              {run.errors && run.errors.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-destructive mb-1">
                    Errors ({run.errors.length})
                  </div>
                  <ul className="text-xs space-y-1 max-h-48 overflow-y-auto">
                    {run.errors.map((e, i) => (
                      <li key={i} className="border-b border-border/40 pb-1 last:border-0">
                        <span className="font-medium">{e.step}:</span> {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Waiting for the run row to appear…
            </div>
          )}
        </div>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
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
  const isInFlight = !!run && !run.finished_at;
  const hasFailed = !!run && (run.failed_count > 0 || (run.notes && run.notes.startsWith('error') && !isInFlight));
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
            {isInFlight ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span>Running — started {formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}</span>
              </>
            ) : hasFailed ? (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                <span>Last run {formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                <span>Last run {formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}</span>
              </>
            )}
          </div>
          <div className="text-muted-foreground">
            Processed {run.processed} · Success {run.success_count}
            {run.failed_count > 0 && ` · Failed ${run.failed_count}`}
          </div>
          {run.notes && !isInFlight && (
            <div className="text-muted-foreground italic">{run.notes}</div>
          )}
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

function DiagnosticsPanel({ d, onDismiss }: { d: RunDiagnostics; onDismiss: () => void }) {
  const money = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  return (
    <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-sm flex items-center gap-2">
            {d.ok ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive" />
            )}
            Last manual run — {d.mode}
            <span className="text-xs font-normal text-muted-foreground">
              {formatDistanceToNow(new Date(d.ranAt), { addSuffix: true })}
            </span>
          </p>
          {d.error && <p className="text-xs text-destructive mt-1">{d.error}</p>}
        </div>
        <Button size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
        <Stat label="Processed" value={d.processed} />
        <Stat label="Success" value={d.successCount} accent="text-green-600" />
        <Stat label="Failed" value={d.failedCount} accent={d.failedCount > 0 ? 'text-destructive' : ''} />
        <Stat label="Donors imported" value={d.totalDonorsImported.toLocaleString()} />
        <Stat label="Total raised" value={money(d.totalRaised)} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
        <Stat label="Remaining in queue" value={d.remaining ?? '—'} />
        <Stat label="Missing FEC IDs" value={d.missingFecCount} accent={d.missingFecCount > 0 ? 'text-amber-600' : ''} />
        <Stat label="FEC IDs auto-filled" value={d.fecIdsFilled} />
      </div>

      {d.candidates.length > 0 && (
        <details open className="rounded-md border bg-background p-2">
          <summary className="cursor-pointer text-xs font-medium">
            Per-candidate progress ({d.candidates.length})
          </summary>
          <div className="mt-2 max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="text-left">
                  <th className="py-1 pr-2">Candidate</th>
                  <th className="py-1 pr-2">State</th>
                  <th className="py-1 pr-2">FEC ID</th>
                  <th className="py-1 pr-2 text-right">Donors</th>
                  <th className="py-1 pr-2 text-right">Raised</th>
                  <th className="py-1 pr-2 text-right">Time</th>
                  <th className="py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {d.candidates.map((c) => (
                  <tr key={c.candidateId} className="border-t border-border/40">
                    <td className="py-1 pr-2">{c.name}</td>
                    <td className="py-1 pr-2 text-muted-foreground">{c.state ?? '—'}</td>
                    <td className="py-1 pr-2 font-mono text-[10px] text-muted-foreground">
                      {c.fecCandidateId ?? '—'}
                    </td>
                    <td className="py-1 pr-2 text-right">{c.imported.toLocaleString()}</td>
                    <td className="py-1 pr-2 text-right">{money(c.totalRaised)}</td>
                    <td className="py-1 pr-2 text-right text-muted-foreground">
                      {(c.durationMs / 1000).toFixed(1)}s
                    </td>
                    <td className="py-1">
                      {c.status === 'success' ? (
                        <Badge variant="secondary" className="text-[10px]">ok</Badge>
                      ) : (
                        <span className="text-destructive text-[10px]" title={c.error}>
                          {c.error ?? 'failed'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {d.missingFec.length > 0 && (
        <details className="rounded-md border bg-background p-2">
          <summary className="cursor-pointer text-xs font-medium text-amber-700">
            Candidates missing FEC IDs ({d.missingFecCount})
          </summary>
          <div className="mt-2 max-h-60 overflow-y-auto space-y-1">
            {d.missingFec.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-2 text-xs border-b border-border/40 pb-1 last:border-0">
                <span className="font-medium">{m.name}</span>
                <span className="text-muted-foreground">{m.state ?? '—'} · {m.office ?? '—'}</span>
                {m.attempted ? (
                  m.filled ? (
                    <Badge variant="secondary" className="text-[10px]">filled</Badge>
                  ) : (
                    <span className="text-destructive text-[10px]">attempt failed{m.error ? `: ${m.error}` : ''}</span>
                  )
                ) : (
                  <span className="text-muted-foreground text-[10px]">not attempted this run</span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {d.errors.length > 0 && (
        <details className="rounded-md border bg-background p-2">
          <summary className="cursor-pointer text-xs font-medium text-destructive">
            Errors ({d.errors.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-destructive max-h-40 overflow-y-auto">
            {d.errors.map((e, i) => <li key={i}>• {e}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded border bg-background px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${accent ?? ''}`}>{value}</div>
    </div>
  );
}

function ErrorPanel({ e, onDismiss }: { e: RunError; onDismiss: () => void }) {
  const ctxString = (() => {
    if (e.context == null) return null;
    try { return JSON.stringify(e.context, null, 2); } catch { return String(e.context); }
  })();
  const copy = () => {
    const payload = [
      `Mode: ${e.mode}`,
      `When: ${e.ranAt}`,
      `Status: ${e.status ?? '—'}`,
      `Name: ${e.name ?? '—'}`,
      `Message: ${e.message}`,
      ctxString ? `Context:\n${ctxString}` : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard?.writeText(payload).then(() => toast.success('Error details copied'));
  };
  return (
    <div className="rounded-lg border-2 border-destructive/50 bg-destructive/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="font-semibold text-sm flex items-center gap-2">
            <XCircle className="h-4 w-4 text-destructive" />
            Run failed — {e.mode}
            <span className="text-xs font-normal text-muted-foreground">
              {formatDistanceToNow(new Date(e.ranAt), { addSuffix: true })}
            </span>
            {e.status !== undefined && (
              <Badge variant="outline" className="text-[10px]">HTTP {String(e.status)}</Badge>
            )}
            {e.name && <Badge variant="outline" className="text-[10px]">{e.name}</Badge>}
          </p>
          <p className="text-xs font-mono break-all text-destructive">{e.message}</p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={copy}>Copy</Button>
          <Button size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Button>
        </div>
      </div>

      <div className="rounded-md border bg-background p-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">What to try</p>
        <ul className="text-xs space-y-1 list-disc pl-4">
          {e.advice.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      </div>

      {ctxString && (
        <details className="rounded-md border bg-background p-2">
          <summary className="cursor-pointer text-xs font-medium">Raw server response</summary>
          <pre className="mt-2 max-h-60 overflow-auto text-[11px] leading-snug whitespace-pre-wrap break-all">
{ctxString}
          </pre>
        </details>
      )}
    </div>
  );
}
