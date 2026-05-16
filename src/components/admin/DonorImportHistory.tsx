import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Undo2, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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
} from '@/components/ui/alert-dialog';

interface ImportSession {
  id: string;
  candidate_id: string | null;
  committee_id: string | null;
  cycle: string;
  filename: string | null;
  multi_committee: boolean;
  row_count: number;
  inserted_contributions: number;
  inserted_donors: number;
  detected_cycle: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  undone_at: string | null;
}

interface Props {
  refreshKey?: number;
  onUndo?: () => void;
}

export function DonorImportHistory({ refreshKey, onUndo }: Props) {
  const [sessions, setSessions] = useState<ImportSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('donor_import_sessions')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(15);
    if (error) {
      console.error('[DonorImportHistory] load error', error);
      toast.error('Failed to load import history');
    } else {
      setSessions((data || []) as ImportSession[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const handleUndo = async (s: ImportSession) => {
    setUndoingId(s.id);
    try {
      const { data, error } = await supabase.rpc('undo_donor_import', { p_session_id: s.id });
      if (error) throw error;
      const summary = data as { deleted_contributions: number; deleted_donors: number };
      toast.success(`Undone: ${summary.deleted_contributions.toLocaleString()} contributions, ${summary.deleted_donors.toLocaleString()} donors removed`);
      await load();
      onUndo?.();
    } catch (err: any) {
      console.error('[DonorImportHistory] undo error', err);
      toast.error(`Undo failed: ${err.message}`);
    } finally {
      setUndoingId(null);
    }
  };

  const ageHours = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3600000;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Recent Donor Imports</CardTitle>
          <CardDescription>Roll back the most recent imports if a wrong cycle slipped through.</CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No imports yet.</p>
        ) : (
          <div className="border rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2">When</th>
                  <th className="text-left p-2">File</th>
                  <th className="text-left p-2">Candidate / Committee</th>
                  <th className="text-center p-2">Cycle</th>
                  <th className="text-right p-2">Rows</th>
                  <th className="text-right p-2">Inserted</th>
                  <th className="text-center p-2">Status</th>
                  <th className="text-right p-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => {
                  const tooOld = ageHours(s.started_at) > 72;
                  const canUndo = s.status !== 'undone' && !tooOld;
                  const cycleMismatch = s.detected_cycle && s.detected_cycle !== s.cycle;
                  return (
                    <tr key={s.id} className="border-t">
                      <td className="p-2 whitespace-nowrap">{new Date(s.started_at).toLocaleString()}</td>
                      <td className="p-2 max-w-[180px] truncate" title={s.filename || ''}>{s.filename || '—'}</td>
                      <td className="p-2 font-mono">
                        {s.multi_committee ? <Badge variant="outline">multi</Badge> : (s.candidate_id || s.committee_id || '—')}
                      </td>
                      <td className="p-2 text-center">
                        {s.cycle}
                        {cycleMismatch && (
                          <Badge variant="outline" className="ml-1 text-amber-600 border-amber-500/50">
                            detected {s.detected_cycle}
                          </Badge>
                        )}
                      </td>
                      <td className="p-2 text-right">{s.row_count.toLocaleString()}</td>
                      <td className="p-2 text-right">{s.inserted_contributions.toLocaleString()}</td>
                      <td className="p-2 text-center">
                        <Badge variant={s.status === 'undone' ? 'secondary' : s.status === 'running' ? 'default' : 'outline'}>
                          {s.status}
                        </Badge>
                      </td>
                      <td className="p-2 text-right">
                        {canUndo ? (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={undoingId === s.id}
                                className="text-destructive hover:text-destructive"
                              >
                                {undoingId === s.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <><Undo2 className="h-3 w-3 mr-1" />Undo</>
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Undo this import?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will delete up to {s.inserted_contributions.toLocaleString()} contributions
                                  and {s.inserted_donors.toLocaleString()} donor rows imported on{' '}
                                  {new Date(s.started_at).toLocaleString()} for cycle <strong>{s.cycle}</strong>.
                                  This cannot be reversed.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleUndo(s)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Yes, undo import
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            {s.status === 'undone' ? 'undone' : tooOld ? '>72h' : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
