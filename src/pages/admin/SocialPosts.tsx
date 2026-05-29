import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Send, Sparkles, X, ImageIcon, ExternalLink, RefreshCw, CheckCircle2, Clock, Play } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useAdminRole } from '@/hooks/useAdminRole';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CandidateStatCard } from '@/components/share/templates/CandidateStatCard';
import { CARD_SIZE } from '@/components/share/templates/types';
import { nodeToBlob } from '@/lib/shareImage';
import { uploadShareCard } from '@/lib/shareUpload';
import { useCandidateShareCardData } from '@/hooks/useCandidateShareCardData';

const PLATFORMS = ['x', 'facebook', 'instagram', 'tiktok'] as const;
type Platform = (typeof PLATFORMS)[number];

interface SocialPost {
  id: string;
  subject_type: string;
  subject_id: string;
  subject_label: string | null;
  stat_key: string | null;
  stat_payload: any;
  image_url: string | null;
  share_url: string | null;
  status: string;
  posted_at: string | null;
  created_at: string;
  rejected_reason: string | null;
}

interface PlatformRow {
  id: string;
  post_id: string;
  platform: Platform;
  caption: string | null;
  enabled: boolean;
  status: string;
  external_url: string | null;
  error_message: string | null;
  posted_at: string | null;
}

interface Settings {
  id: number;
  mode: 'manual' | 'auto';
  post_time_local: string;
  timezone: string;
  auto_approve_after_hours: number;
  x_enabled: boolean;
  facebook_enabled: boolean;
  instagram_enabled: boolean;
  tiktok_enabled: boolean;
  recent_skip_days: number;
}

// ---------- Offscreen card renderer ----------
/**
 * Mounts the full rep-profile share card offscreen, fed by the same hook the
 * rep profile uses. Exposes `capture()` via the imperative handle so the
 * parent's render button can produce a PNG only once data is ready.
 */
interface HiddenCardRendererHandle {
  capture: () => Promise<{ shareUrl: string; id: string; imageUrl?: string }>;
  ready: boolean;
}

const HiddenCardRenderer = ({
  candidateId,
  subjectLabel,
  onReadyChange,
  registerRef,
}: {
  candidateId: string;
  subjectLabel: string | null;
  onReadyChange: (ready: boolean) => void;
  registerRef: (node: HTMLDivElement | null) => void;
}) => {
  const { loading, data } = useCandidateShareCardData(candidateId);
  const ready = !loading && !!data;
  useEffect(() => {
    onReadyChange(ready);
  }, [ready, onReadyChange]);

  if (!data) return null;
  const cardData = { kind: 'candidate-alignment' as const, ...data };
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        left: -99999,
        top: 0,
        width: CARD_SIZE,
        height: CARD_SIZE,
        pointerEvents: 'none',
        opacity: 0,
      }}
    >
      <div ref={registerRef}>
        <CandidateStatCard data={cardData as any} />
      </div>
      <span className="sr-only">{subjectLabel}</span>
    </div>
  );
};

async function captureAndUpload(
  node: HTMLDivElement,
  subjectId: string,
  data: { candidateName: string; candidateOffice: string; candidateParty: string },
): Promise<{ shareUrl: string; id: string; imageUrl?: string }> {
  // Give web fonts / images a tick to settle
  await new Promise((r) => setTimeout(r, 250));
  const blob = await nodeToBlob(node);
  const profileUrl = `${window.location.origin}/candidate/${encodeURIComponent(subjectId)}`;
  return await uploadShareCard({
    blob,
    targetUrl: profileUrl,
    ogTitle: `${data.candidateName} — PoliPulse`,
    ogDescription: `${data.candidateOffice}${data.candidateParty ? ' • ' + data.candidateParty : ''}`,
  });
}

// ---------- Hooks ----------
function useSettings() {
  return useQuery({
    queryKey: ['social-post-settings'],
    queryFn: async (): Promise<Settings> => {
      const { data, error } = await supabase.from('social_post_settings').select('*').eq('id', 1).single();
      if (error) throw error;
      return data as Settings;
    },
  });
}

function useSocialPosts(status: 'pending_review' | 'posted_or_failed') {
  return useQuery({
    queryKey: ['social-posts', status],
    queryFn: async () => {
      let q = supabase.from('social_posts').select('*').order('created_at', { ascending: false });
      if (status === 'pending_review') q = q.eq('status', 'pending_review');
      else q = q.in('status', ['posted', 'failed', 'rejected']);
      const { data, error } = await q.limit(50);
      if (error) throw error;
      return (data ?? []) as SocialPost[];
    },
    refetchInterval: 30_000,
  });
}

function usePlatformRows(postIds: string[]) {
  return useQuery({
    queryKey: ['social-post-platforms', postIds],
    enabled: postIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('social_post_platforms').select('*').in('post_id', postIds);
      if (error) throw error;
      return (data ?? []) as PlatformRow[];
    },
  });
}

// ---------- Subcomponents ----------
function SettingsTab() {
  const { data: settings, isLoading } = useSettings();
  const qc = useQueryClient();
  const [local, setLocal] = useState<Settings | null>(null);
  useEffect(() => { if (settings) setLocal(settings); }, [settings]);

  const save = useMutation({
    mutationFn: async (s: Settings) => {
      const { error } = await supabase.from('social_post_settings').update({
        mode: s.mode,
        post_time_local: s.post_time_local,
        timezone: s.timezone,
        auto_approve_after_hours: s.auto_approve_after_hours,
        x_enabled: s.x_enabled,
        facebook_enabled: s.facebook_enabled,
        instagram_enabled: s.instagram_enabled,
        tiktok_enabled: s.tiktok_enabled,
        recent_skip_days: s.recent_skip_days,
      }).eq('id', 1);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Settings saved'); qc.invalidateQueries({ queryKey: ['social-post-settings'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const generateForce = useMutation({
    mutationFn: async () => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pick-daily-stat-card?force=1`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'failed');
      return j;
    },
    onSuccess: (j) => {
      toast.success(j.ok ? `Draft created for ${j.subject_id}` : `Skipped: ${j.skipped ?? 'unknown'}`);
      qc.invalidateQueries({ queryKey: ['social-posts'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !local) return <Loader2 className="h-5 w-5 animate-spin" />;

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader><CardTitle>Posting mode</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-post mode</Label>
              <p className="text-sm text-muted-foreground">When off, drafts wait for admin approval. When on, drafts auto-post after the delay below.</p>
            </div>
            <Switch checked={local.mode === 'auto'} onCheckedChange={(v) => setLocal({ ...local, mode: v ? 'auto' : 'manual' })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Post time (local)</Label>
              <Input type="time" value={local.post_time_local.slice(0, 5)} onChange={(e) => setLocal({ ...local, post_time_local: e.target.value + ':00' })} />
            </div>
            <div>
              <Label>Timezone</Label>
              <Select value={local.timezone} onValueChange={(v) => setLocal({ ...local, timezone: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/New_York">Eastern (NY)</SelectItem>
                  <SelectItem value="America/Chicago">Central</SelectItem>
                  <SelectItem value="America/Denver">Mountain</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific (LA)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Auto-approve delay (hours)</Label>
              <Input type="number" min={0} max={48} value={local.auto_approve_after_hours} onChange={(e) => setLocal({ ...local, auto_approve_after_hours: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Skip recently featured (days)</Label>
              <Input type="number" min={1} max={365} value={local.recent_skip_days} onChange={(e) => setLocal({ ...local, recent_skip_days: Number(e.target.value) })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Platforms</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(['x', 'facebook', 'instagram', 'tiktok'] as const).map((p) => (
            <div key={p} className="flex items-center justify-between">
              <div>
                <Label className="capitalize">{p === 'x' ? 'X (Twitter)' : p}</Label>
                {p !== 'x' && <p className="text-xs text-muted-foreground">Requires API credentials — posts will fail until configured.</p>}
              </div>
              <Switch checked={(local as any)[`${p}_enabled`]} onCheckedChange={(v) => setLocal({ ...local, [`${p}_enabled`]: v } as Settings)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={() => save.mutate(local)} disabled={save.isPending}>
          {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save settings
        </Button>
        <Button variant="outline" onClick={() => generateForce.mutate()} disabled={generateForce.isPending}>
          {generateForce.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
          Generate draft now
        </Button>
      </div>
    </div>
  );
}

function PostCard({ post, platforms, onChanged }: { post: SocialPost; platforms: PlatformRow[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [localPlatforms, setLocalPlatforms] = useState(platforms);
  useEffect(() => setLocalPlatforms(platforms), [platforms]);

  // Offscreen renderer for the rep-profile share card. We always mount it so
  // the underlying hooks pre-fetch donor/finance/IE data — by the time the
  // admin clicks "Render", the DOM node is ready to capture.
  const cardNodeRef = useRef<HTMLDivElement | null>(null);
  const [cardReady, setCardReady] = useState(false);
  const { data: cardData } = useCandidateShareCardData(
    post.subject_type === 'candidate' ? post.subject_id : null,
  );

  const updatePlatform = async (id: string, patch: Partial<PlatformRow>) => {
    setLocalPlatforms((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    await supabase.from('social_post_platforms').update(patch).eq('id', id);
  };

  const regenerate = async (platform: Platform) => {
    setBusy(`gen-${platform}`);
    try {
      const { data, error } = await supabase.functions.invoke('generate-social-caption', {
        body: { post_id: post.id, platform },
      });
      if (error) throw error;
      const row = localPlatforms.find((p) => p.platform === platform);
      if (row) await updatePlatform(row.id, { caption: data.caption });
      toast.success(`${platform} caption generated`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const render = async () => {
    setBusy('render');
    try {
      // Wait up to 10s for offscreen card data + DOM to settle
      const start = Date.now();
      while (!(cardReady && cardNodeRef.current && cardData) && Date.now() - start < 10000) {
        await new Promise((r) => setTimeout(r, 150));
      }
      if (!cardNodeRef.current || !cardData) {
        throw new Error('Card data not ready — try again in a moment');
      }
      const { shareUrl, id, imageUrl } = await captureAndUpload(
        cardNodeRef.current,
        post.subject_id,
        {
          candidateName: cardData.candidateName,
          candidateOffice: cardData.candidateOffice,
          candidateParty: cardData.candidateParty,
        },
      );
      const { error } = await supabase
        .from('social_posts')
        .update({ share_url: shareUrl, share_card_id: id, image_url: imageUrl ?? null })
        .eq('id', post.id);
      if (error) throw error;
      toast.success('Card rendered');
      onChanged();
    } catch (e) {
      toast.error('Render failed: ' + (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const approveAndPost = async () => {
    if (!post.share_url) { toast.error('Render image first'); return; }
    setBusy('post');
    try {
      const { data, error } = await supabase.functions.invoke('post-social-card', { body: { post_id: post.id } });
      if (error) throw error;
      const failed = Object.entries(data.results ?? {}).filter(([, r]: any) => !r.ok);
      if (failed.length) toast.warning(`Some platforms failed: ${failed.map(([p]) => p).join(', ')}`);
      else toast.success('Posted');
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    if (!confirm('Reject this draft?')) return;
    await supabase.from('social_posts').update({ status: 'rejected' }).eq('id', post.id);
    onChanged();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">{post.subject_label}</CardTitle>
            <p className="text-xs text-muted-foreground">
              Score: {post.stat_payload?.overall_score ?? '—'} • Created {new Date(post.created_at).toLocaleString()}
            </p>
          </div>
          <Badge variant={post.status === 'posted' ? 'default' : 'secondary'}>{post.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          {post.image_url || post.share_url ? (
            <a href={post.image_url ?? post.share_url ?? '#'} target="_blank" rel="noreferrer" className="text-sm text-primary inline-flex items-center gap-1">
              <ImageIcon className="h-4 w-4" /> View card <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="text-sm text-muted-foreground">No image rendered yet.</span>
          )}
          <Button size="sm" variant="outline" onClick={render} disabled={busy === 'render'}>
            {busy === 'render' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ImageIcon className="h-3 w-3 mr-1" />}
            {post.share_url ? 'Re-render' : 'Render image'}
          </Button>
        </div>

        <div className="space-y-3">
          {localPlatforms.map((p) => (
            <div key={p.id} className="border rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch checked={p.enabled} onCheckedChange={(v) => updatePlatform(p.id, { enabled: v })} />
                  <span className="font-medium capitalize">{p.platform === 'x' ? 'X (Twitter)' : p.platform}</span>
                  {p.status !== 'pending' && <Badge variant={p.status === 'posted' ? 'default' : 'destructive'} className="text-xs">{p.status}</Badge>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => regenerate(p.platform)} disabled={busy === `gen-${p.platform}`}>
                  {busy === `gen-${p.platform}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                  AI caption
                </Button>
              </div>
              <Textarea
                value={p.caption ?? ''}
                onChange={(e) => setLocalPlatforms((prev) => prev.map((x) => x.id === p.id ? { ...x, caption: e.target.value } : x))}
                onBlur={(e) => updatePlatform(p.id, { caption: e.target.value })}
                placeholder="Caption…"
                className="min-h-[60px] text-sm"
              />
              {p.error_message && <p className="text-xs text-destructive">{p.error_message}</p>}
              {p.external_url && (
                <a href={p.external_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1">
                  View post <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={reject}><X className="h-4 w-4 mr-1" />Reject</Button>
          <Button size="sm" onClick={approveAndPost} disabled={busy === 'post' || !post.share_url}>
            {busy === 'post' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
            Approve &amp; Post Now
          </Button>
        </div>

        {/* Offscreen full-fidelity card (matches the rep-profile share card) */}
        {cardData && (
          <div
            aria-hidden
            style={{
              position: 'fixed',
              left: -99999,
              top: 0,
              width: CARD_SIZE,
              height: CARD_SIZE,
              pointerEvents: 'none',
              opacity: 0,
            }}
          >
            <div
              ref={(node) => {
                cardNodeRef.current = node;
                setCardReady(!!node);
              }}
            >
              <CandidateStatCard data={{ kind: 'candidate-alignment', ...cardData } as any} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QueueTab() {
  const { data: posts, isLoading, refetch } = useSocialPosts('pending_review');
  const ids = useMemo(() => (posts ?? []).map((p) => p.id), [posts]);
  const { data: platforms } = usePlatformRows(ids);
  const platformsByPost = useMemo(() => {
    const m = new Map<string, PlatformRow[]>();
    (platforms ?? []).forEach((p) => { const arr = m.get(p.post_id) ?? []; arr.push(p); m.set(p.post_id, arr); });
    return m;
  }, [platforms]);

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (!posts || posts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
        No drafts awaiting review. New drafts appear at your configured posting time (or click <strong>Generate draft now</strong> in Settings).
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} platforms={platformsByPost.get(p.id) ?? []} onChanged={refetch} />
      ))}
    </div>
  );
}

function HistoryTab() {
  const { data: posts, isLoading } = useSocialPosts('posted_or_failed');
  const ids = useMemo(() => (posts ?? []).map((p) => p.id), [posts]);
  const { data: platforms } = usePlatformRows(ids);

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (!posts || posts.length === 0) return <p className="text-muted-foreground text-sm">No posted history yet.</p>;

  return (
    <div className="space-y-3">
      {posts.map((p) => {
        const rows = (platforms ?? []).filter((x) => x.post_id === p.id);
        return (
          <Card key={p.id}>
            <CardContent className="py-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.subject_label}</span>
                  <Badge variant={p.status === 'posted' ? 'default' : p.status === 'rejected' ? 'outline' : 'destructive'}>{p.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.posted_at ? `Posted ${new Date(p.posted_at).toLocaleString()}` : `Created ${new Date(p.created_at).toLocaleString()}`}
                </p>
                <div className="flex gap-2 mt-1">
                  {rows.filter((r) => r.external_url).map((r) => (
                    <a key={r.id} href={r.external_url!} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 capitalize">
                      {r.platform} <ExternalLink className="h-3 w-3" />
                    </a>
                  ))}
                </div>
              </div>
              {p.share_url && (
                <Button asChild size="sm" variant="ghost"><a href={p.share_url} target="_blank" rel="noreferrer">Card</a></Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function SocialPosts() {
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
            <h1 className="text-2xl font-bold">Social Posts</h1>
            <p className="text-sm text-muted-foreground">Daily auto-generated stat-card posts from rep profiles.</p>
          </div>
          <Button asChild variant="outline" size="sm"><Link to="/admin">← Admin</Link></Button>
        </div>
        <Tabs defaultValue="queue">
          <TabsList>
            <TabsTrigger value="queue">Queue</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="queue" className="mt-4"><QueueTab /></TabsContent>
          <TabsContent value="history" className="mt-4"><HistoryTab /></TabsContent>
          <TabsContent value="settings" className="mt-4"><SettingsTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
