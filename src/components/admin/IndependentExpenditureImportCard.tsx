import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Megaphone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ImportResult {
  success: boolean;
  cycle: string;
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  unmapped_committees: number;
  unmapped_candidates: number;
}

export function IndependentExpenditureImportCard() {
  const [cycle, setCycle] = useState('2024');
  const [minAmount, setMinAmount] = useState(50000);
  const [maxPages, setMaxPages] = useState(5);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<ImportResult | null>(null);

  const handleRun = async () => {
    setRunning(true);
    setLast(null);
    const toastId = toast.loading(`Importing independent expenditures (cycle ${cycle})…`);
    try {
      const { data, error } = await supabase.functions.invoke('import-independent-expenditures', {
        body: { cycle, min_amount: minAmount, max_pages: maxPages },
      });
      if (error) throw error;
      const result = data as ImportResult;
      setLast(result);
      toast.success(
        `Done — ${result.inserted} new, ${result.updated} updated, ${result.skipped} skipped`,
        { id: toastId },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Import failed: ${msg}`, { id: toastId });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-5 w-5" />
          Independent Expenditures Import
        </CardTitle>
        <CardDescription>
          Pulls FEC Schedule E outside-spending notices (Super PAC / dark money) and links them to
          your candidates and committees by FEC ID.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ie-cycle">Cycle</Label>
            <Input id="ie-cycle" value={cycle} onChange={(e) => setCycle(e.target.value)} placeholder="2024" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ie-min">Min amount ($)</Label>
            <Input
              id="ie-min"
              type="number"
              min={0}
              value={minAmount}
              onChange={(e) => setMinAmount(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ie-pages">Max pages (100/ea)</Label>
            <Input
              id="ie-pages"
              type="number"
              min={1}
              max={20}
              value={maxPages}
              onChange={(e) => setMaxPages(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            />
          </div>
        </div>

        <Button onClick={handleRun} disabled={running} className="w-full">
          {running ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Importing…
            </>
          ) : (
            <>
              <Megaphone className="mr-2 h-4 w-4" />
              Run import
            </>
          )}
        </Button>

        {last && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
            <p className="font-medium">Last run · cycle {last.cycle}</p>
            <p className="text-muted-foreground">
              Fetched {last.fetched} · Inserted {last.inserted} · Updated {last.updated} · Skipped {last.skipped}
            </p>
            <p className="text-muted-foreground">
              Unmapped committees: {last.unmapped_committees} · Unmapped candidates: {last.unmapped_candidates}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
