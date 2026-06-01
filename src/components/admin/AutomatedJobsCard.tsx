import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Play, Loader2, RefreshCw, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
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

export function AutomatedJobsCard() {
  const qc = useQueryClient();
  const [runningMode, setRunningMode] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<RunDiagnostics | null>(null);

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
    const toastId = toast.loading(`Running ${mode}…`);
    try {
      const { data, error } = await supabase.functions.invoke('schedule-congress-donor-sync', {
        body: { scope: 'congress_visible', mode, limit: mode === 'backfill' ? 10 : 25, cycle: '2024' },
      });
      if (error) throw error;
      const r = data as {
        ok: boolean;
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
      toast.success(s.message ?? `${mode} run complete`, { id: toastId });
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

        {diagnostics && <DiagnosticsPanel d={diagnostics} onDismiss={() => setDiagnostics(null)} />}

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
