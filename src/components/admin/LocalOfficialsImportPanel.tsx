import { useState } from 'react';
import Papa from 'papaparse';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, ListChecks } from 'lucide-react';
import { toast } from 'sonner';

interface RosterRow {
  state?: string;
  city?: string;
  name?: string;
  seat?: string;
  party?: string;
  office?: string;
  websiteUrl?: string;
  imageUrl?: string;
}

interface SeatSummary {
  state: string;
  city: string;
  total: number;
  wardSeats: string[];
  atLargeOrMayor: number;
}

interface ImportResult {
  dryRun?: boolean;
  willUpsert?: number;
  upserted?: number;
  cities?: number;
  errors?: { index: number; error: string }[];
  seatSummary?: SeatSummary[];
}

// Parse the pasted text as JSON ({rows:[...]} or [...]) or CSV.
function parseRows(text: string): RosterRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    const arr = Array.isArray(parsed) ? parsed : parsed.rows;
    if (!Array.isArray(arr)) throw new Error('JSON must be an array or { "rows": [...] }');
    return arr as RosterRow[];
  }
  const out = Papa.parse<Record<string, string>>(trimmed, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  if (out.errors.length) throw new Error(out.errors[0].message);
  return (out.data || []).map((r) => ({
    state: r.state,
    city: r.city,
    name: r.name,
    seat: r.seat,
    party: r.party,
    office: r.office,
    websiteUrl: r.websiteurl || r.website_url || r.website,
    imageUrl: r.imageurl || r.image_url || r.image,
  }));
}

export function LocalOfficialsImportPanel() {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const run = async (dryRun: boolean) => {
    let rows: RosterRow[];
    try {
      rows = parseRows(text);
    } catch (e) {
      toast.error(`Could not parse input: ${(e as Error).message}`);
      return;
    }
    if (!rows.length) {
      toast.error('No rows found. Paste CSV or JSON first.');
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke<ImportResult>('import-local-officials', {
        body: { rows, dryRun },
      });
      if (error) throw error;
      if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
      setResult(data ?? null);
      if (dryRun) {
        toast.success(`Dry run: ${data?.willUpsert ?? 0} ready, ${data?.errors?.length ?? 0} error(s)`);
      } else {
        toast.success(`Imported ${data?.upserted ?? 0} officials across ${data?.cities ?? 0} cities`);
        queryClient.invalidateQueries({ queryKey: ['static-officials'] });
        queryClient.invalidateQueries({ queryKey: ['civic-officials-admin'] });
      }
    } catch (e) {
      console.error('Import failed:', e);
      toast.error(`Import failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Local Officials</CardTitle>
        <CardDescription>
          Paste a council roster as CSV or JSON to upsert into static officials. Columns:{' '}
          <code>state, city, name, seat</code> (e.g. <code>Ward 1</code> / <code>District 9</code> /{' '}
          <code>At-Large</code> / <code>Mayor</code>), optional <code>party, office, websiteUrl, imageUrl</code>.
          Importing also pre-seeds each city's ward/district boundary source. See{' '}
          <code>docs/local-officials-import.md</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'state,city,name,seat,party\nNJ,Piscataway,Frank Uhrin,Ward 1,Democrat'}
          rows={10}
          className="font-mono text-xs"
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => run(true)} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
            Dry run
          </Button>
          <Button onClick={() => run(false)} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import
          </Button>
        </div>

        {result && (
          <div className="rounded-lg border border-border p-3 text-sm space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                {result.dryRun ? `${result.willUpsert ?? 0} ready` : `${result.upserted ?? 0} imported`}
              </Badge>
              {!!result.errors?.length && (
                <Badge variant="destructive">{result.errors.length} error(s)</Badge>
              )}
            </div>
            {!!result.seatSummary?.length && (
              <ul className="text-xs text-muted-foreground space-y-1">
                {result.seatSummary.map((s) => (
                  <li key={`${s.state}-${s.city}`}>
                    <span className="font-medium text-foreground">{s.city}, {s.state}</span>: {s.total} seats
                    {s.wardSeats.length > 0 && <> — wards/districts {s.wardSeats.join(', ')}</>}
                    {s.atLargeOrMayor > 0 && <> — {s.atLargeOrMayor} at-large/mayor</>}
                  </li>
                ))}
              </ul>
            )}
            {!!result.errors?.length && (
              <ul className="text-xs text-destructive space-y-1">
                {result.errors.slice(0, 10).map((e) => (
                  <li key={e.index}>Row {e.index + 1}: {e.error}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
