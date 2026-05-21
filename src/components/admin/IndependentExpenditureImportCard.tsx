import { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Loader2, Megaphone, Upload, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import Papa from 'papaparse';

interface Stats {
  totalRows: number;
  processedRows: number;
  inserted: number;
  updated: number;
  skippedInvalid: number;
  skippedBelowMin: number;
  errors: string[];
  unmappedCommittees: Set<string>;
  unmappedCandidates: Set<string>;
  currentBatch: number;
  totalBatches: number;
}

const BATCH_SIZE = 500;
const DELAY_MS = 150;
const MAX_RETRIES = 5;

export function IndependentExpenditureImportCard({ onImportComplete }: { onImportComplete?: () => void } = {}) {
  const [file, setFile] = useState<File | null>(null);
  const [cycle, setCycle] = useState('2024');
  const [minAmount, setMinAmount] = useState(0);
  const [detectedCycle, setDetectedCycle] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const cancelRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setStats(null);
    setProgress(0);
    setDetectedCycle(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      Papa.parse(text, {
        header: true,
        preview: 2000,
        complete: (res) => {
          const rows = res.data as any[];
          const counts: Record<string, number> = {};
          for (const r of rows) {
            const lower: Record<string, any> = {};
            for (const [k, v] of Object.entries(r)) lower[k.toLowerCase()] = v;
            const yr = String(
              lower.fec_election_yr ?? lower.two_year_transaction_period ?? lower.cycle ?? '',
            ).trim();
            if (yr) counts[yr] = (counts[yr] || 0) + 1;
          }
          const dom = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
          if (dom) {
            setDetectedCycle(dom);
            setCycle(dom);
          }
        },
      });
    };
    reader.readAsText(f.slice(0, 500_000));
  };

  const cancelImport = () => {
    cancelRef.current = true;
    toast.info('Cancelling import…');
  };

  const handleImport = async () => {
    if (!file) {
      toast.error('Please select a CSV file');
      return;
    }
    cancelRef.current = false;
    setIsImporting(true);
    setProgress(0);

    const text = await file.text();
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const allRows = results.data as any[];

        // Apply min-amount filter client-side
        const filtered = minAmount > 0
          ? allRows.filter((r) => {
              const lower: Record<string, any> = {};
              for (const [k, v] of Object.entries(r)) lower[k.toLowerCase()] = v;
              const amt = Number(String(lower.exp_amo ?? lower.expenditure_amount ?? lower.amount ?? '').replace(/[$,\s]/g, ''));
              return Number.isFinite(amt) && amt >= minAmount;
            })
          : allRows;
        const skippedBelowMin = allRows.length - filtered.length;

        const totalRows = filtered.length;
        const totalBatches = Math.ceil(totalRows / BATCH_SIZE);
        const s: Stats = {
          totalRows,
          processedRows: 0,
          inserted: 0,
          updated: 0,
          skippedInvalid: 0,
          skippedBelowMin,
          errors: [],
          unmappedCommittees: new Set(),
          unmappedCandidates: new Set(),
          currentBatch: 0,
          totalBatches,
        };
        setStats({ ...s });

        let forceCycleMismatch = false;
        const sessionId = (crypto as any).randomUUID ? (crypto as any).randomUUID() : `ie-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        for (let i = 0; i < totalRows; i += BATCH_SIZE) {
          if (cancelRef.current) break;
          const batch = filtered.slice(i, i + BATCH_SIZE);
          const batchNum = Math.floor(i / BATCH_SIZE) + 1;
          s.currentBatch = batchNum;

          let retry = 0;
          while (retry < MAX_RETRIES) {
            try {
              const { data, error } = await supabase.functions.invoke('import-fec-schedule-e-csv', {
                body: {
                  rows: batch,
                  cycle,
                  isFirstBatch: i === 0,
                  isLastBatch: i + BATCH_SIZE >= totalRows,
                  sessionId,
                  filename: file.name,
                  totalRowCount: totalRows,
                  force: forceCycleMismatch,
                },
              });

              // Cycle-mismatch handling
              let mismatchData: any = null;
              if (error) {
                const ctx: any = (error as any).context;
                if (ctx?.json) mismatchData = await ctx.json().catch(() => null);
              }
              const md = data?.error === 'cycle_mismatch' ? data : (mismatchData?.error === 'cycle_mismatch' ? mismatchData : null);
              if (md) {
                const ok = window.confirm(
                  `Cycle mismatch: file looks like cycle ${md.detected_cycle} but you selected ${cycle}.\n\nClick OK to import anyway tagged as ${cycle}, or Cancel to abort.`,
                );
                if (!ok) {
                  s.errors.push(`Aborted: cycle mismatch (file=${md.detected_cycle}, selected=${cycle})`);
                  setStats({ ...s });
                  setIsImporting(false);
                  return;
                }
                forceCycleMismatch = true;
                continue;
              }

              if (error) {
                const retryable = error.message?.includes('WORKER_LIMIT') || error.message?.includes('timeout') || (error as any).status === 504 || (error as any).status === 503;
                if (retryable && retry < MAX_RETRIES - 1) {
                  retry++;
                  await new Promise((r) => setTimeout(r, Math.pow(2, retry) * 1000));
                  continue;
                }
                s.errors.push(`Batch ${batchNum}: ${error.message}`);
              } else if (data) {
                s.inserted += data.newRows ?? data.inserted ?? 0;
                s.updated += data.updatedRows ?? 0;
                s.skippedInvalid += data.skippedInvalid || 0;
                for (const c of data.unmappedCommittees || []) s.unmappedCommittees.add(c);
                for (const c of data.unmappedCandidates || []) s.unmappedCandidates.add(c);
                if (data.failedBatches && data.errors?.length) {
                  for (const e of data.errors) s.errors.push(`Batch ${batchNum}: ${e}`);
                }
              }
              break;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              if (retry < MAX_RETRIES - 1) {
                retry++;
                await new Promise((r) => setTimeout(r, Math.pow(2, retry) * 1000));
                continue;
              }
              s.errors.push(`Batch ${batchNum}: ${msg}`);
              break;
            }
          }

          s.processedRows = Math.min(i + BATCH_SIZE, totalRows);
          setStats({ ...s });
          setProgress((s.processedRows / totalRows) * 100);
          if (i + BATCH_SIZE < totalRows) await new Promise((r) => setTimeout(r, DELAY_MS));
        }

        // Finalize session if user cancelled before the last batch fired isLastBatch
        if (cancelRef.current) {
          try {
            await supabase.functions.invoke('import-fec-schedule-e-csv', {
              body: { sessionId, finalize: true, failed: s.inserted === 0 },
            });
          } catch (_e) { /* ignore */ }
        }

        setIsImporting(false);
        if (cancelRef.current) {
          toast.info(`Cancelled · ${s.inserted} rows imported`);
        } else {
          toast.success(`Imported ${s.inserted} expenditures (${s.unmappedCommittees.size} unmapped committees)`);
        }
        onImportComplete?.();
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-5 w-5" />
          Independent Expenditures Import
        </CardTitle>
        <CardDescription>
          Upload an FEC Schedule E CSV (bulk download or API export). Rows are upserted by
          transaction ID and linked to your candidates/committees by FEC ID.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="ie-file">CSV file</Label>
          <Input
            id="ie-file"
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileSelect}
            disabled={isImporting}
          />
          {file && (
            <p className="text-xs text-muted-foreground mt-1">
              {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
              {detectedCycle && <> · detected cycle: <strong>{detectedCycle}</strong></>}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ie-cycle">Cycle (tag rows as)</Label>
            <Input id="ie-cycle" value={cycle} onChange={(e) => setCycle(e.target.value)} placeholder="2024" disabled={isImporting} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ie-min">Min amount ($, optional)</Label>
            <Input
              id="ie-min"
              type="number"
              min={0}
              value={minAmount}
              onChange={(e) => setMinAmount(Math.max(0, Number(e.target.value) || 0))}
              disabled={isImporting}
            />
          </div>
        </div>

        {isImporting && stats ? (
          <div className="space-y-2">
            <Progress value={progress} />
            <p className="text-xs text-muted-foreground">
              Batch {stats.currentBatch}/{stats.totalBatches} · {stats.processedRows}/{stats.totalRows} rows · {stats.inserted} imported
            </p>
            <Button variant="outline" onClick={cancelImport} className="w-full">
              <XCircle className="mr-2 h-4 w-4" /> Cancel
            </Button>
          </div>
        ) : (
          <Button onClick={handleImport} disabled={!file || isImporting} className="w-full">
            <Upload className="mr-2 h-4 w-4" /> Run import
          </Button>
        )}

        {stats && !isImporting && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
            <p className="font-medium">Last run</p>
            <p className="text-muted-foreground">
              Imported {stats.inserted} · Invalid rows {stats.skippedInvalid}
              {stats.skippedBelowMin > 0 && <> · Below min amount {stats.skippedBelowMin}</>}
            </p>
            <p className="text-muted-foreground">
              Unmapped committees: {stats.unmappedCommittees.size} · Unmapped candidates: {stats.unmappedCandidates.size}
            </p>
            {stats.unmappedCommittees.size > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs">Show unmapped committee IDs</summary>
                <p className="text-xs font-mono break-all mt-1">
                  {Array.from(stats.unmappedCommittees).slice(0, 50).join(', ')}
                  {stats.unmappedCommittees.size > 50 && '…'}
                </p>
              </details>
            )}
            {stats.errors.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-destructive">Errors ({stats.errors.length})</summary>
                <ul className="text-xs mt-1 space-y-0.5">
                  {stats.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
