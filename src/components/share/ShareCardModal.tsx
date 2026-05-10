import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Check, Copy, Download, Facebook, Linkedin, Loader2, RotateCcw, Share2, Twitter } from 'lucide-react';
import { toast } from 'sonner';
import { BoldCard } from './templates/BoldCard';
import { DataCard } from './templates/DataCard';
import { CardData, CARD_SIZE } from './templates/types';
import { copyNodeToClipboard, downloadNode, nodeToBlob, nodeToFile } from '@/lib/shareImage';
import { uploadShareCard } from '@/lib/shareUpload';
import {
  CaptionInput,
  composeFinalText,
  generateShortCaption,
  getDefaultHashtags,
} from '@/lib/shareCaptions';
import {
  facebookIntent,
  linkedinIntent,
  nativeShare,
  openIntent,
  supportsNativeShare,
  twitterIntent,
} from '@/lib/shareIntents';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/lib/analytics';

const TEMPLATES = [
  { id: 'bold', label: 'Bold', Component: BoldCard },
  { id: 'data', label: 'Data', Component: DataCard },
] as const;

type TemplateId = typeof TEMPLATES[number]['id'];

interface ShareCardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  data: CardData;
  caption: CaptionInput;
  triggerLabel?: string;
}

/**
 * Renders a 1080×1080 card scaled to fit its parent (a square container).
 * Uses ResizeObserver so the preview always fills the tile cleanly without
 * clipping or empty borders.
 */
const CardThumb = ({ children }: { children: React.ReactNode }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = e.contentRect.width;
        if (w > 0) setScale(w / CARD_SIZE);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div
        style={{
          width: CARD_SIZE,
          height: CARD_SIZE,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  );
};


export const ShareCardModal = ({
  open,
  onOpenChange,
  url,
  data,
  caption,
}: ShareCardModalProps) => {
  const [selected, setSelected] = useState<TemplateId>('bold');
  const [busy, setBusy] = useState<null | 'download' | 'copy' | 'native'>(null);
  const refs = useRef<Record<TemplateId, HTMLDivElement | null>>({
    bold: null,
    data: null,
  });

  const defaultBody = useMemo(() => generateShortCaption(caption), [caption]);
  const defaultHashtags = useMemo(() => getDefaultHashtags(caption), [caption]);

  const [body, setBody] = useState(defaultBody);
  const [includeHashtags, setIncludeHashtags] = useState(true);
  const editedFiredRef = useRef(false);
  const surface = caption.surface;

  // Reset when the modal opens with new content
  useEffect(() => {
    if (open) {
      setBody(defaultBody);
      setIncludeHashtags(true);
      editedFiredRef.current = false;
      trackEvent('share_modal_opened', {
        surface,
        kind: caption.kind,
        templateDefault: 'bold',
      });
    }
  }, [open, defaultBody, surface, caption.kind]);

  // Fire once per session when caption first diverges from the suggestion
  useEffect(() => {
    if (!open || editedFiredRef.current) return;
    if (body.trim() !== defaultBody.trim()) {
      editedFiredRef.current = true;
      trackEvent('share_caption_edited', { surface, kind: caption.kind, template: selected });
    }
    // selected intentionally omitted from deps — we only watch body changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, defaultBody, open]);

  const finalText = useMemo(
    () => composeFinalText(body, defaultHashtags, includeHashtags),
    [body, defaultHashtags, includeHashtags],
  );

  const isEdited = body.trim() !== defaultBody.trim() || !includeHashtags;
  const charCount = finalText.length;
  const charLimit = 280;
  const charClass =
    charCount > charLimit
      ? 'text-destructive'
      : charCount > charLimit - 40
      ? 'text-amber-600 dark:text-amber-500'
      : 'text-muted-foreground';

  const handleResetCaption = () => {
    setBody(defaultBody);
    setIncludeHashtags(true);
  };

  const filename = useMemo(() => {
    const base =
      caption.kind === 'candidate-alignment'
        ? `pulse-${caption.candidateName?.replace(/\s+/g, '-').toLowerCase()}`
        : caption.kind === 'user-profile'
        ? 'pulse-my-profile'
        : 'pulse-invite';
    return `${base}-${selected}.png`;
  }, [selected, caption]);

  const getNode = () => refs.current[selected];

  const baseProps = () => ({
    surface,
    kind: caption.kind,
    template: selected,
    includeHashtags,
    edited: isEdited,
    charCount,
  });

  const handleDownload = async () => {
    const node = getNode();
    if (!node) return;
    setBusy('download');
    trackEvent('share_action', { ...baseProps(), action: 'download', destination: 'file' });
    try {
      await downloadNode(node, filename);
      toast.success('Image downloaded — attach it to your post.');
    } catch (e) {
      toast.error('Could not generate image.');
      console.error(e);
    } finally {
      setBusy(null);
    }
  };

  const handleCopyImage = async () => {
    const node = getNode();
    if (!node) return;
    setBusy('copy');
    trackEvent('share_action', { ...baseProps(), action: 'copy_image', destination: 'clipboard' });
    try {
      const ok = await copyNodeToClipboard(node);
      if (ok) {
        toast.success('Image copied — paste it into your post.');
      } else {
        await downloadNode(node, filename);
        toast.message('Clipboard not supported — image was downloaded instead.');
      }
    } catch (e) {
      toast.error('Could not copy image.');
      console.error(e);
    } finally {
      setBusy(null);
    }
  };

  const handleCopyCaption = async () => {
    trackEvent('share_action', { ...baseProps(), action: 'copy_caption', destination: 'clipboard' });
    try {
      await navigator.clipboard.writeText(finalText);
      toast.success('Caption copied to clipboard.');
    } catch {
      toast.error('Could not copy caption.');
    }
  };

  // Cache uploaded share URL per template id, keyed inside this open session
  const shareUrlCache = useRef<Partial<Record<TemplateId, string>>>({});

  // Reset cache when modal reopens or caption surface changes meaningfully
  useEffect(() => {
    if (open) shareUrlCache.current = {};
  }, [open, defaultBody]);

  const ogTitle = useMemo(() => {
    if (caption.kind === 'candidate-alignment' && caption.candidateName) {
      return `My match with ${caption.candidateName} on Pulse`;
    }
    if (caption.kind === 'user-profile') return 'My political profile on Pulse';
    return 'Pulse — Know Your Vote';
  }, [caption]);

  const prepareShareUrl = async (): Promise<string> => {
    const cached = shareUrlCache.current[selected];
    if (cached) return cached;
    const node = getNode();
    if (!node) return url;
    const blob = await nodeToBlob(node);
    const { shareUrl } = await uploadShareCard({
      blob,
      targetUrl: url,
      ogTitle,
      ogDescription: body.slice(0, 280),
    });
    shareUrlCache.current[selected] = shareUrl;
    return shareUrl;
  };

  const handleNative = async () => {
    const node = getNode();
    if (!node) return;
    setBusy('native');
    trackEvent('share_action', { ...baseProps(), action: 'native', destination: 'native' });
    try {
      let files: File[] | undefined;
      try {
        files = [await nodeToFile(node, filename)];
      } catch {
        files = undefined;
      }
      let shareUrl = url;
      try {
        shareUrl = await prepareShareUrl();
      } catch (e) {
        console.warn('share url upload failed, using fallback', e);
      }
      const ok = await nativeShare({
        title: 'Pulse',
        text: finalText,
        url: shareUrl,
        files,
      });
      if (!ok) toast.error('Share failed.');
    } finally {
      setBusy(null);
    }
  };

  const handleSocialIntent = async (
    destination: 'twitter' | 'facebook' | 'linkedin',
    build: (shareUrl: string) => string,
  ) => {
    setBusy('native');
    trackEvent('share_action', { ...baseProps(), action: 'open_intent', destination });
    try {
      let shareUrl = url;
      try {
        shareUrl = await prepareShareUrl();
      } catch (e) {
        console.warn('share url upload failed, using fallback', e);
        toast.message('Sharing without preview image — couldn\'t upload card.');
      }
      openIntent(build(shareUrl));
    } finally {
      setBusy(null);
    }
  };
  const SelectedComponent = TEMPLATES.find(t => t.id === selected)!.Component;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create your share card</DialogTitle>
          <DialogDescription>
            Pick a design, then download or copy the image and share with the link.
          </DialogDescription>
        </DialogHeader>

        {/* Template grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TEMPLATES.map(({ id, label, Component }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setSelected(id);
                if (id !== selected) {
                  trackEvent('share_template_selected', {
                    surface,
                    kind: caption.kind,
                    template: id,
                    previous: selected,
                  });
                }
              }}
              className={cn(
                'group flex flex-col gap-2 rounded-xl text-left transition-all',
              )}
              aria-pressed={selected === id}
            >
              <div
                className={cn(
                  'relative w-full overflow-hidden rounded-xl border-2 bg-muted shadow-sm',
                  selected === id
                    ? 'border-primary ring-2 ring-primary/30'
                    : 'border-border group-hover:border-primary/50',
                )}
                style={{ aspectRatio: '1 / 1' }}
              >
                <CardThumb>
                  <Component data={data} />
                </CardThumb>
              </div>
              <div className="flex items-center justify-between px-1">
                <span
                  className={cn(
                    'text-xs font-medium',
                    selected === id ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {label}
                </span>
                {selected === id && <Check className="w-3.5 h-3.5 text-primary" />}
              </div>
            </button>
          ))}
        </div>

        {/* Big preview of selected */}
        <div className="rounded-xl bg-muted/40 p-4 flex items-center justify-center overflow-hidden">
          <div
            className="relative w-full max-w-[420px] overflow-hidden rounded-lg border border-border bg-background shadow-sm"
            style={{ aspectRatio: '1 / 1' }}
          >
            <CardThumb>
              <SelectedComponent data={data} />
            </CardThumb>
          </div>
        </div>

        {/* Hidden full-size renders for export */}
        <div
          aria-hidden
          style={{
            position: 'fixed',
            left: -99999,
            top: 0,
            pointerEvents: 'none',
            opacity: 0,
          }}
        >
          {TEMPLATES.map(({ id, Component }) => (
            <div
              key={id}
              ref={el => {
                refs.current[id] = el;
              }}
            >
              <Component data={data} />
            </div>
          ))}
        </div>

        {/* Caption editor */}
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="share-caption" className="text-sm font-semibold">
              Caption
            </Label>
            {isEdited && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetCaption}
                className="h-7 gap-1 text-xs"
              >
                <RotateCcw className="w-3 h-3" />
                Reset to suggested
              </Button>
            )}
          </div>
          <Textarea
            id="share-caption"
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={4}
            placeholder="Write a custom message…"
            className="resize-y bg-background"
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Switch
                id="hashtags-toggle"
                checked={includeHashtags}
                onCheckedChange={(v) => {
                  setIncludeHashtags(v);
                  trackEvent('share_hashtags_toggled', {
                    surface,
                    kind: caption.kind,
                    template: selected,
                    enabled: v,
                  });
                }}
              />
              <Label htmlFor="hashtags-toggle" className="text-sm cursor-pointer">
                Include suggested hashtags
              </Label>
              <span className="text-xs text-muted-foreground font-mono">
                {defaultHashtags}
              </span>
            </div>
            <span className={cn('text-xs tabular-nums', charClass)}>
              {charCount} / {charLimit}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={handleDownload} disabled={!!busy} className="gap-2">
            {busy === 'download' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Download PNG
          </Button>
          <Button onClick={handleCopyImage} disabled={!!busy} variant="secondary" className="gap-2">
            {busy === 'copy' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            Copy image
          </Button>
          <Button onClick={handleCopyCaption} variant="ghost" className="gap-2">
            <Copy className="w-4 h-4" />
            Copy caption
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenIntent('twitter', twitterIntent(finalText, url))}
            className="gap-2"
          >
            <Twitter className="w-4 h-4" />
            Share on X
          </Button>
          <Button
            variant="outline"
            onClick={() => handleOpenIntent('facebook', facebookIntent(url, finalText))}
            className="gap-2"
          >
            <Facebook className="w-4 h-4" />
            Facebook
          </Button>
          <Button
            variant="outline"
            onClick={() => handleOpenIntent('linkedin', linkedinIntent(url))}
            className="gap-2"
          >
            <Linkedin className="w-4 h-4" />
            LinkedIn
          </Button>
          {supportsNativeShare() && (
            <Button variant="outline" onClick={handleNative} disabled={!!busy} className="gap-2">
              {busy === 'native' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Share2 className="w-4 h-4" />
              )}
              More…
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Tip: X, Facebook and LinkedIn don't accept images via direct links — copy or
          download the image first, then paste/attach it in the composer.
        </p>
      </DialogContent>
    </Dialog>
  );
};
