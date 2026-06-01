import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatCompactCurrency } from '@/lib/utils';

interface SyncResult {
  processed: number;
  successCount: number;
  failedCount: number;
  totalDonorsImported: number;
  totalRaised: number;
  errors?: string[];
  message?: string;
}

export function BulkDonorSyncCard() {
  const [cycle, setCycle] = useState('2024');
  const [limit, setLimit] = useState(50);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  const handleSync = async () => {
    setIsSyncing(true);
    setLastResult(null);
    const toastId = toast.loading(`Syncing donors for ${limit} candidates (cycle ${cycle})…`);
    try {
      const { data, error } = await supabase.functions.invoke('sync-all-donors', {
        body: { cycle, limit },
      });
      if (error) throw error;
      const result = data as SyncResult;
      setLastResult(result);
      toast.success(result.message ?? 'Bulk donor sync complete', { id: toastId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Bulk sync failed: ${msg}`, { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Bulk FEC Donor Sync (manual)
        </CardTitle>
        <CardDescription>
          Manual one-off sync. Visible-state House &amp; Senate candidates are now auto-backfilled —
          see the <strong>Automated Jobs</strong> card above. Use this card for ad-hoc runs across
          all candidates or non-congress scopes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-sync-cycle">Cycle</Label>
            <Input
              id="bulk-sync-cycle"
              value={cycle}
              onChange={(e) => setCycle(e.target.value)}
              placeholder="2024"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-sync-limit">Candidate limit</Label>
            <Input
              id="bulk-sync-limit"
              type="number"
              min={1}
              max={500}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
            />
          </div>
        </div>

        <Button onClick={handleSync} disabled={isSyncing} className="w-full">
          {isSyncing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Syncing… (this may take a few minutes)
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Sync donors for next {limit} candidates
            </>
          )}
        </Button>

        {lastResult && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
            <p className="font-medium">Last run</p>
            <p className="text-muted-foreground">
              Processed {lastResult.processed} · Success {lastResult.successCount} · Failed {lastResult.failedCount}
            </p>
            <p className="text-muted-foreground">
              Donors imported: {lastResult.totalDonorsImported.toLocaleString()} ·
              {' '}Total raised: {formatCompactCurrency(lastResult.totalRaised)}
            </p>
            {lastResult.errors && lastResult.errors.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-destructive">
                  {lastResult.errors.length} errors
                </summary>
                <ul className="mt-1 list-disc pl-5 text-xs text-destructive/80">
                  {lastResult.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
