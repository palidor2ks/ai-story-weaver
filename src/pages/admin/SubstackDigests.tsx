import { useEffect, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Sparkles, Copy, Download, ExternalLink, CheckCircle2, Trash2, Clock, Info } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useAdminRole } from '@/hooks/useAdminRole';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

// Substack has no publishing API, so this screen never posts. It compiles recent
// social-post cards into a long-form Markdown digest you review, copy, and paste
// into Substack yourself.

interface DigestSettings {
  id: number;
  substack_enabled: boolean;
  substack_frequency_days: number;
  substack_lookback_days: number;
  substack_publication_url: string | null;
}

interface Digest {
  id: string;
  title: string;
  subtitle: string | null;
  body_markdown: string;
  status: string;
  item_count: number;
  model: string | null;
  period_start: string | null;
  period_end: string | null;
  published_at: string | null;
  created_at: string;
}

function newPostUrl(pubUrl: string | null | undefined): string {
  const base = (pubUrl ?? '').trim().replace(/\/+$/, '');
  return base ? `${base}/publish/post` : 'https://substack.com/publish/post';
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error('Copy failed — your browser blocked clipboard access');
  }
}

function downloadMarkdown(d: Digest) {
  const slug = d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'digest';
  const front = d.subtitle ? `# ${d.title}\n\n_${d.subtitle}_\n\n` : `# ${d.title}\n\n`;
  const blob = new Blob([front + d.body_markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- Hooks ----------
function useDigestSettings() {
  return useQuery({
    queryKey: ['substack-settings'],
    queryFn: async (): Promise<DigestSettings> => {
      const { data, error } = await supabase
        .from('social_post_settings')
        .select('id, substack_enabled, substack_frequency_days, substack_lookback_days, substack_publication_url')
        .eq('id', 1)
        .single();
      if (error) throw error;
      return data as DigestSettings;
    },
  });
}

function useDigests() {
  return useQuery({
    queryKey: ['substack-digests'],
    queryFn: async (): Promise<Digest[]> => {
      const { data, error } = await supabase
        .from('substack_digests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Digest[];
    },
    refetchInterval: 30_000,
  });
}

// ---------- Settings ----------
function SettingsCard() {
  const { data: settings, isLoading } = useDigestSettings();
  const qc = useQueryClient();
  const [local, setLocal] = useState<DigestSettings | null>(null);
  useEffect(() => { if (settings) setLocal(settings); }, [settings]);

  const save = useMutation({
    mutationFn: async (s: DigestSettings) => {
      const { error } = await supabase.from('social_post_settings').update({
        substack_enabled: s.substack_enabled,
        substack_frequency_days: s.substack_frequency_days,
        substack_lookback_days: s.substack_lookback_days,
        substack_publication_url: s.substack_publication_url?.trim() || null,
      }).eq('id', 1);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Settings saved'); qc.invalidateQueries({ queryKey: ['substack-settings'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-substack-digest', { body: { force: true } });
      if (error) throw error;
      return data as { ok?: boolean; skipped?: string; message?: string; title?: string; item_count?: number };
    },
    onSuccess: (j) => {
      if (j.skipped) {
        toast.warning(j.message ?? `Nothing generated (${j.skipped.replace(/_/g, ' ')})`);
      } else {
        toast.success(`Digest drafted: “${j.title}” (${j.item_count} items)`);
      }
      qc.invalidateQueries({ queryKey: ['substack-digests'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !local) return <Loader2 className="h-5 w-5 animate-spin" />;

  return (
    <Card>
      <CardHeader><CardTitle>Newsletter settings</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>Auto-generate digest</Label>
            <p className="text-sm text-muted-foreground">When on, a new draft is compiled on the cadence below. It is never posted — you review and publish it.</p>
          </div>
          <Switch checked={local.substack_enabled} onCheckedChange={(v) => setLocal({ ...local, substack_enabled: v })} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Generate every (days)</Label>
            <Input type="number" min={1} max={90} value={local.substack_frequency_days}
              onChange={(e) => setLocal({ ...local, substack_frequency_days: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Look back (days)</Label>
            <Input type="number" min={1} max={90} value={local.substack_lookback_days}
              onChange={(e) => setLocal({ ...local, substack_lookback_days: Number(e.target.value) })} />
          </div>
        </div>
        <div>
          <Label>Substack publication URL (optional)</Label>
          <Input type="url" placeholder="https://yourpublication.substack.com" value={local.substack_publication_url ?? ''}
            onChange={(e) => setLocal({ ...local, substack_publication_url: e.target.value })} />
          <p className="text-xs text-muted-foreground mt-1">Used for the “Open in Substack” button so it lands on your editor.</p>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={() => save.mutate(local)} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save settings
          </Button>
          <Button variant="outline" onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Generate digest now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Digest editor ----------
function DigestCard({ digest, onChanged }: { digest: Digest; onChanged: () => void }) {
  const { data: settings } = useDigestSettings();
  const [draft, setDraft] = useState(digest);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => setDraft(digest), [digest]);

  const dirty = draft.title !== digest.title || draft.subtitle !== digest.subtitle || draft.body_markdown !== digest.body_markdown;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  const save = () => run('save', async () => {
    const { error } = await supabase.from('substack_digests')
      .update({ title: draft.title, subtitle: draft.subtitle, body_markdown: draft.body_markdown })
      .eq('id', digest.id);
    if (error) throw error;
    toast.success('Saved');
    onChanged();
  });

  const setStatus = (status: string) => run(status, async () => {
    const patch: Record<string, unknown> = { status };
    if (status === 'published') patch.published_at = new Date().toISOString();
    const { error } = await supabase.from('substack_digests').update(patch).eq('id', digest.id);
    if (error) throw error;
    toast.success(status === 'published' ? 'Marked as published' : `Marked as ${status}`);
    onChanged();
  });

  const remove = () => run('delete', async () => {
    if (!confirm('Delete this digest?')) return;
    const { error } = await supabase.from('substack_digests').delete().eq('id', digest.id);
    if (error) throw error;
    toast.success('Deleted');
    onChanged();
  });

  const range = digest.period_start && digest.period_end
    ? `${new Date(digest.period_start).toLocaleDateString()} – ${new Date(digest.period_end).toLocaleDateString()}`
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <CardTitle className="text-base truncate">{digest.title}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {digest.item_count} items{range ? ` • ${range}` : ''} • Created {new Date(digest.created_at).toLocaleString()}
              {digest.model === 'fallback' ? ' • template' : ''}
            </p>
          </div>
          <Badge variant={digest.status === 'published' ? 'default' : digest.status === 'archived' ? 'outline' : 'secondary'}>
            {digest.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2">
          <Label className="text-xs">Title</Label>
          <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <Label className="text-xs">Subtitle</Label>
          <Input value={draft.subtitle ?? ''} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} placeholder="Optional deck" />
          <Label className="text-xs">Body (Markdown)</Label>
          <Textarea
            value={draft.body_markdown}
            onChange={(e) => setDraft({ ...draft, body_markdown: e.target.value })}
            className="min-h-[260px] font-mono text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={save} disabled={!dirty || busy === 'save'}>
            {busy === 'save' && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Save edits
          </Button>
          <Button size="sm" variant="outline" onClick={() => copyText(draft.body_markdown, 'Markdown')}>
            <Copy className="h-4 w-4 mr-1" /> Copy Markdown
          </Button>
          <Button size="sm" variant="outline" onClick={() => downloadMarkdown(draft)}>
            <Download className="h-4 w-4 mr-1" /> Download .md
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={newPostUrl(settings?.substack_publication_url)} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4 mr-1" /> Open in Substack
            </a>
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {digest.status !== 'published' ? (
              <Button size="sm" variant="secondary" onClick={() => setStatus('published')} disabled={busy === 'published'}>
                {busy === 'published' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                Mark published
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setStatus('draft')} disabled={busy === 'draft'}>
                Reopen as draft
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={remove} disabled={busy === 'delete'}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DigestList() {
  const { data: digests, isLoading, refetch } = useDigests();
  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (!digests || digests.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
        No digests yet. Use <strong>Generate digest now</strong> above, or turn on auto-generate.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {digests.map((d) => <DigestCard key={d.id} digest={d} onChanged={refetch} />)}
    </div>
  );
}

export default function SubstackDigests() {
  const { user, loading: authLoading } = useAuth();
  const { data: adminData, isLoading: adminLoading } = useAdminRole();

  if (authLoading || adminLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user || !adminData?.isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Substack Digest</h1>
            <p className="text-sm text-muted-foreground">Auto-compiled newsletter drafts from recent social cards.</p>
          </div>
          <Button asChild variant="outline" size="sm"><Link to="/admin">← Admin</Link></Button>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <p>Substack has no publishing API, so nothing posts automatically. Each edition is drafted here for you to review, then copy or open in Substack and publish manually.</p>
        </div>

        <SettingsCard />
        <DigestList />
      </main>
    </div>
  );
}
