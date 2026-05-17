import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Landmark } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SyncResult {
  processed: number;
  successCount: number;
  failedCount: number;
  totalReceipts: number;
  totalItemized: number;
  errors?: string[];
  message?: string;
}

const ROLE_OPTIONS = [
  { value: 'all', label: 'JFC + Leadership PAC + External' },
  { value: 'joint_fundraising', label: 'Joint fundraising only' },
  { value: 'leadership_pac', label: 'Leadership PAC only' },
  { value: 'external', label: 'External only' },
];

export function BulkCommitteeTotalsCard() {
  const [cycle, setCycle] = useState('2024');
  const [limit, setLimit] = useState(100);
  const [roleSel, setRoleSel] = useState('all');
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  const handleSync = async () => {
    setIsSyncing(true);
    setLastResult(null);
    const roles = roleSel === 'all'
      ? ['joint_fundraising', 'leadership_pac', 'external']
      : [roleSel];
    const toastId = toast.loading(`Syncing FEC totals for up to ${limit} committees (cycle ${cycle})…`);
    try {
      const { data, error } = await supabase.functions.invoke('sync-committee-totals', {
        body: { cycle, limit, roles, onlyMissing },
      });
      if (error) throw error;
      const result = data as SyncResult;
      setLastResult(result);
      toast.success(result.message ?? 'Committee totals sync complete', { id: toastId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Sync failed: ${msg}`, { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="h-5 w-5" />
          Committee FEC Totals Sync
        </CardTitle>
        <CardDescription>
          Pulls aggregate FEC totals (receipts, itemized) for joint-fundraising committees, leadership PACs,
          and other non-principal committees that show $0 in the directory. Does not import donor-level data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ct-cycle">Cycle</Label>
            <Input
              id="ct-cycle"
              value={cycle}
              onChange={(e) => setCycle(e.target.value)}
              placeholder="2024"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ct-limit">Committee limit</Label>
            <Input
              id="ct-limit"
              type="number"
              min={1}
              max={500}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Committee roles</Label>
          <Select value={roleSel} onValueChange={setRoleSel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label htmlFor="ct-only-missing" className="font-medium">Only unsynced committees</Label>
            <p className="text-xs text-muted-foreground">Skip committees that already have a sync date.</p>
          </div>
          <Switch
            id="ct-only-missing"
            checked={onlyMissing}
            onCheckedChange={setOnlyMissing}
          />
        </div>

        <Button onClick={handleSync} disabled={isSyncing} className="w-full">
          {isSyncing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Syncing…
            </>
          ) : (
            <>
              <Landmark className="mr-2 h-4 w-4" />
              Sync up to {limit} committees
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
              Receipts: ${Math.round(lastResult.totalReceipts ?? 0).toLocaleString()} ·
              {' '}Itemized: ${Math.round(lastResult.totalItemized ?? 0).toLocaleString()}
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
