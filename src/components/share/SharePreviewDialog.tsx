import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle2, Copy, Download, Loader2 } from 'lucide-react';
import { renderNodeWithQA, RenderQAResult, triggerBlobDownload } from '@/lib/shareImage';
import { toast } from 'sonner';

interface SharePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: HTMLElement | null;
  filename: string;
}

/**
 * Pre-share preview: rasterizes the export node, compares it to the on-screen
 * render to flag cropping or font-loading issues, then shows the user the
 * actual PNG that would be downloaded or shared.
 */
export const SharePreviewDialog = ({
  open,
  onOpenChange,
  node,
  filename,
}: SharePreviewDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RenderQAResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (!open || !node) return;
    let cancelled = false;
    setResult(null);
    setError(null);
    setLoading(true);
    renderNodeWithQA(node)
      .then(r => {
        if (!cancelled) setResult(r);
      })
      .catch(e => {
        if (!cancelled) setError(e?.message ?? 'Could not generate preview');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, node]);

  const handleDownload = () => {
    if (!result) return;
    triggerBlobDownload(result.blob, filename);
    toast.success('Image downloaded.');
    onOpenChange(false);
  };

  const handleCopy = async () => {
    if (!result) return;
    setCopying(true);
    try {
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
        triggerBlobDownload(result.blob, filename);
        toast.message('Clipboard not supported — downloaded instead.');
      } else {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': result.blob })]);
        toast.success('Image copied to clipboard.');
      }
      onOpenChange(false);
    } catch (e) {
      console.warn(e);
      toast.error('Could not copy image.');
    } finally {
      setCopying(false);
    }
  };

  const hasWarnings = (result?.warnings.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pre-share preview</DialogTitle>
          <DialogDescription>
            This is the exact PNG that will be downloaded or attached to your post.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-center justify-center min-h-[320px]">
          {loading && (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-sm">Rendering and verifying export…</span>
            </div>
          )}
          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}
          {result && (
            <img
              src={result.dataUrl}
              alt="Export preview"
              className="max-h-[420px] w-auto rounded-md shadow-sm"
            />
          )}
        </div>

        {result && (
          <Alert variant={hasWarnings ? 'destructive' : 'default'}>
            {hasWarnings ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            <AlertTitle>
              {hasWarnings ? 'Issues detected' : 'Export looks good'}
            </AlertTitle>
            <AlertDescription>
              <div className="text-xs tabular-nums mb-1">
                {result.width} × {result.height} px
                {' · expected '}
                {result.expectedWidth} × {result.expectedHeight} px
                {' · fonts '}
                {result.fontsReady ? 'ready' : 'unconfirmed'}
                {' · render '}
                {result.stable ? 'stable' : 'unstable'}
              </div>
              {hasWarnings && (
                <ul className="list-disc pl-4 text-xs space-y-0.5">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={handleCopy}
            disabled={!result || copying}
            className="gap-2"
          >
            {copying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
            Copy image
          </Button>
          <Button onClick={handleDownload} disabled={!result} className="gap-2">
            <Download className="w-4 h-4" />
            Download PNG
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
