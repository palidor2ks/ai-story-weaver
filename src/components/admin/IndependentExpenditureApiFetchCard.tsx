import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Cloud, Loader2, Megaphone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ApiResult {
  cycle: string;
  min_amount: number;
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  unmapped_committees: number;
  unmapped_candidates: number;
}

export function IndependentExpenditureApiFetchCard({ onImportComplete }: { onImportComplete?: () => void } = {}) {
  const [cycle, setCycle] = useState('2026');
  const [minAmount, setMinAmount] = useState(10000);
  const [maxPages, setMaxPages] = useState(10);
  const [isFetching, setIsFetching] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);

  const handleFetch = async () => {
    setIsFetching(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('import-independent-expenditures', {
        body: { cycle, min_amount: minAmount, max_pages: maxPages },
      });
      if (error) {
        // Surface the function's JSON error body when present (e.g. FEC API errors).
        let detail = error.message;
        const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
        if (ctx?.json) {
          const j = await ctx.json().catch(() => null);
          if (j?.error) detail = j.error;
        }
        throw new Error(detail);
      }
      const r = data as ApiResult;
      setResult(r);
      toast.success(`${r.inserted} new · ${r.updated} updated · ${r.fetched} fetched`);
      onImportComplete?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fetch failed');
    } finally {
      setIsFetching(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-5 w-5" />
          Fetch Independent Expenditures from FEC API
        </CardTitle>
        <CardDescription>
          Pull the most-recent Schedule E independent expenditures for a cycle straight from the FEC
          API — no CSV download needed. Rows are upserted by transaction ID and linked to your
          candidates by FEC ID. This runs the same job as the nightly <code>ie-import-daily</code>{' '}
          cron, on demand.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ie-api-cycle">Cycle</Label>
            <Input
              id="ie-api-cycle"
              value={cycle}
              onChange={(e) => setCycle(e.target.value)}
              placeholder="2026"
              disabled={isFetching}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ie-api-min">Min amount ($)</Label>
            <Input
              id="ie-api-min"
              type="number"
              min={0}
              value={minAmount}
              onChange={(e) => setMinAmount(Math.max(0, Number(e.target.value) || 0))}
              disabled={isFetching}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ie-api-pages">Max pages (×100)</Label>
            <Input
              id="ie-api-pages"
              type="number"
              min={1}
              max={20}
              value={maxPages}
              onChange={(e) => setMaxPages(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
              disabled={isFetching}
            />
          </div>
        </div>

        <Button onClick={handleFetch} disabled={isFetching} className="w-full">
          {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Cloud className="mr-2 h-4 w-4" />}
          {isFetching ? 'Fetching from FEC…' : 'Fetch from FEC API'}
        </Button>

        {result && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
            <p className="font-medium">Last run · cycle {result.cycle}</p>
            <p className="text-muted-foreground">
              {result.fetched} fetched · {result.inserted} new · {result.updated} updated ·{' '}
              {result.skipped} skipped
            </p>
            <p className="text-muted-foreground">
              Unmapped committees: {result.unmapped_committees} · Unmapped candidates:{' '}
              {result.unmapped_candidates}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
