import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, RefreshCw, Upload, Send } from "lucide-react";
import { useAdminRole } from "@/hooks/useAdminRole";
import { LoadingScreen } from "@/components/LoadingScreen";
import { supabase } from "@/integrations/supabase/client";
import { nodeToBlob } from "@/lib/shareImage";
import { uploadShareCard } from "@/lib/shareUpload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

const platforms = ["x", "facebook", "instagram", "linkedin", "tiktok"] as const;
type Platform = (typeof platforms)[number];
type Status = "draft" | "approved" | "posted" | "failed";

interface StatCard {
  id: string;
  source_url: string;
  source_title: string | null;
  stat_title: string;
  stat_value: string;
  stat_context: string | null;
  source_label: string | null;
  caption: string | null;
  status: Status;
  share_card_id: string | null;
  share_url: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

const statusVariants: Record<Status, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  approved: "outline",
  posted: "default",
  failed: "destructive",
};

function StatCardArtwork({ card, innerRef }: { card: StatCard; innerRef?: RefObject<HTMLDivElement> }) {
  return (
    <div
      ref={innerRef}
      style={{
        width: 540,
        height: 540,
        background: "linear-gradient(135deg, #08111f 0%, #153b75 55%, #6d28d9 100%)",
        color: "white",
        padding: 38,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        borderRadius: 28,
        boxShadow: "0 24px 70px rgba(15, 23, 42, 0.28)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", inset: 0, opacity: 0.16, background: "radial-gradient(circle at 18% 20%, white 0, transparent 28%), radial-gradient(circle at 85% 75%, white 0, transparent 24%)" }} />
      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, letterSpacing: 2, textTransform: "uppercase", opacity: 0.86 }}>
        <span>PoliPulse Stat Card</span>
        <span>{card.source_label || "Source"}</span>
      </div>
      <div style={{ position: "relative" }}>
        <div style={{ fontSize: 86, lineHeight: 0.92, fontWeight: 900, letterSpacing: -4, marginBottom: 22 }}>
          {card.stat_value}
        </div>
        <div style={{ fontSize: 31, lineHeight: 1.05, fontWeight: 800, letterSpacing: -1.2, maxWidth: 455 }}>
          {card.stat_title}
        </div>
        {card.stat_context && (
          <div style={{ fontSize: 18, lineHeight: 1.3, opacity: 0.88, marginTop: 20, maxWidth: 460 }}>
            {card.stat_context}
          </div>
        )}
      </div>
      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "end", gap: 24, fontSize: 15, opacity: 0.9 }}>
        <span style={{ maxWidth: 340 }}>Source: {card.source_label || new URL(card.source_url).hostname}</span>
        <span style={{ fontWeight: 800 }}>polipulseapp.com</span>
      </div>
    </div>
  );
}

export default function SocialStatCards() {
  const { data, isLoading } = useAdminRole();
  const [cards, setCards] = useState<StatCard[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingCards, setLoadingCards] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [draftStatValue, setDraftStatValue] = useState("");
  const [draftSourceLabel, setDraftSourceLabel] = useState("");
  const [statTitle, setStatTitle] = useState("");
  const [statValue, setStatValue] = useState("");
  const [statContext, setStatContext] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [posting, setPosting] = useState(false);
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(["x"]);
  const cardRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => cards.find((card) => card.id === selectedId) ?? cards[0] ?? null, [cards, selectedId]);

  const loadCards = async () => {
    setLoadingCards(true);
    const { data: rows, error } = await supabase
      .from("social_stat_cards" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) {
      toast.error("Failed to load stat cards", { description: error.message });
    } else {
      const nextCards = (rows ?? []) as unknown as StatCard[];
      setCards(nextCards);
      setSelectedId((current) => current ?? nextCards[0]?.id ?? null);
    }
    setLoadingCards(false);
  };

  useEffect(() => {
    if (data?.isAdmin) loadCards();
  }, [data?.isAdmin]);

  useEffect(() => {
    if (!selected) return;
    setStatTitle(selected.stat_title);
    setStatValue(selected.stat_value);
    setStatContext(selected.stat_context ?? "");
    setSourceLabel(selected.source_label ?? "");
  }, [selected?.id]);

  if (isLoading) return <LoadingScreen />;
  if (!data?.isAdmin) return <Navigate to="/" replace />;

  const createDraft = async () => {
    if (!sourceUrl.trim()) return;
    setCreating(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("collect-stat-card-data", {
        body: {
          sourceUrl: sourceUrl.trim(),
          ...(draftStatValue.trim() ? { statValue: draftStatValue.trim() } : {}),
          ...(draftSourceLabel.trim() ? { sourceLabel: draftSourceLabel.trim() } : {}),
        },
      });
      if (error) throw error;
      if ((res as any)?.error) throw new Error((res as any).error);
      const card = (res as any).card as StatCard;
      setCards((prev) => [card, ...prev]);
      setSelectedId(card.id);
      setSourceUrl("");
      setDraftStatValue("");
      setDraftSourceLabel("");
      toast.success("Draft stat card created");
    } catch (err) {
      toast.error("Draft failed", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setCreating(false);
    }
  };

  const updateSelected = async (patch: Partial<StatCard>) => {
    if (!selected) return;
    setSaving(true);
    try {
      const { data: row, error } = await supabase
        .from("social_stat_cards" as any)
        .update(patch)
        .eq("id", selected.id)
        .select("*")
        .single();
      if (error) throw error;
      const updated = row as unknown as StatCard;
      setCards((prev) => prev.map((card) => (card.id === updated.id ? updated : card)));
      toast.success("Stat card saved");
    } catch (err) {
      toast.error("Save failed", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setSaving(false);
    }
  };

  const renderAndUpload = async () => {
    if (!selected || !cardRef.current) return;
    setRendering(true);
    try {
      await updateSelected({
        stat_title: statTitle.trim(),
        stat_value: statValue.trim(),
        stat_context: statContext.trim(),
        source_label: sourceLabel.trim(),
      } as Partial<StatCard>);
      const blob = await nodeToBlob(cardRef.current);
      const appBase = window.location.origin.includes("localhost") ? "https://polipulseapp.com" : window.location.origin;
      const { id, shareUrl, imageUrl } = await uploadShareCard({
        blob,
        targetUrl: `${appBase}/stat-card/${selected.id}`,
        ogTitle: selected.stat_title,
        ogDescription: selected.stat_context || selected.source_title || "PoliPulse stat card",
      });
      await updateSelected({ share_card_id: id, share_url: shareUrl, image_url: imageUrl ?? null } as Partial<StatCard>);
      toast.success("Share image uploaded");
    } catch (err) {
      toast.error("Render/upload failed", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setRendering(false);
    }
  };


  const generateCaption = async () => {
    if (!selected) return;
    setGeneratingCaption(true);
    try {
      const prompt = [
        "Write a concise, engaging social caption for this factual stat card.",
        "Do not change the number. Include the source label. Return plain text only.",
        `Title: ${statTitle}`,
        `Stat: ${statValue}`,
        `Context: ${statContext}`,
        `Source: ${sourceLabel || selected.source_label || selected.source_url}`,
      ].join("\n");
      const { data: res, error } = await supabase.functions.invoke("generate-poll-questions", {
        body: { prompt, type: "mc", topic: statTitle },
      });
      if (error) throw error;
      const payload = res as any;
      const aiText = payload?.description || payload?.title;
      const fallback = `${statTitle}: ${statValue}\n\n${statContext}\n\nSource: ${sourceLabel || selected.source_label || "PoliPulse"}`;
      setCards((prev) => prev.map((card) => card.id === selected.id ? { ...card, caption: (aiText || fallback).trim() } : card));
      toast.success("Caption draft generated");
    } catch (err) {
      toast.error("Caption generation failed", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setGeneratingCaption(false);
    }
  };

  const postSelected = async () => {
    if (!selected) return;
    setPosting(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("post-social-card", {
        body: {
          cardId: selected.id,
          platforms: selectedPlatforms,
          caption: selected.caption,
        },
      });
      if (error) throw error;
      if ((res as any)?.error) throw new Error((res as any).error);
      const failures = ((res as any).results ?? []).filter((r: any) => r.status === "failed");
      if (failures.length) {
        toast.warning("Posted with failures", { description: failures.map((f: any) => `${f.platform}: ${f.error}`).join(" | ") });
      } else {
        toast.success("Stat card posted");
      }
      await loadCards();
    } catch (err) {
      toast.error("Post failed", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setPosting(false);
    }
  };

  const togglePlatform = (platform: Platform) => {
    setSelectedPlatforms((prev) => prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]);
  };

  return (
    <div className="container max-w-7xl py-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin"><ArrowLeft className="h-4 w-4 mr-1" /> Back to admin</Link>
        </Button>
        <Button variant="outline" size="sm" onClick={loadCards} disabled={loadingCards}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI stat-card social agent</CardTitle>
          <CardDescription>
            Pull source-page facts into a reviewable draft, render a share card, then publish through approved social APIs.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-5">
          <div className="md:col-span-2 space-y-2">
            <Label htmlFor="source-url">Source URL</Label>
            <Input id="source-url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://example.com/report" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-stat-value">Stat value override</Label>
            <Input id="new-stat-value" value={draftStatValue} onChange={(e) => setDraftStatValue(e.target.value)} placeholder="$1.2M" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-source-label">Source label</Label>
            <Input id="new-source-label" value={draftSourceLabel} onChange={(e) => setDraftSourceLabel(e.target.value)} placeholder="FEC" />
          </div>
          <div className="flex items-end">
            <Button onClick={createDraft} disabled={creating || !sourceUrl.trim()} className="w-full">
              {creating ? "Pulling…" : "Create draft"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Draft queue</CardTitle>
            <CardDescription>{loadingCards ? "Loading…" : `${cards.length} recent cards`}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {cards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => setSelectedId(card.id)}
                className={`w-full rounded-lg border p-3 text-left transition hover:bg-muted ${selected?.id === card.id ? "border-primary bg-muted" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium line-clamp-2">{card.stat_title}</div>
                  <Badge variant={statusVariants[card.status]}>{card.status}</Badge>
                </div>
                <div className="mt-2 text-2xl font-bold">{card.stat_value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{new Date(card.created_at).toLocaleString()}</div>
              </button>
            ))}
            {!cards.length && <p className="text-sm text-muted-foreground">No stat-card drafts yet.</p>}
          </CardContent>
        </Card>

        {selected ? (
          <div className="grid gap-6 xl:grid-cols-[1fr_580px]">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>Review and approve</CardTitle>
                    <CardDescription>Edit facts and caption before publishing.</CardDescription>
                  </div>
                  <Badge variant={statusVariants[selected.status]}>{selected.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Source</Label>
                  <a href={selected.source_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
                    {selected.source_title || selected.source_url} <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stat-title">Card title</Label>
                  <Input id="stat-title" value={statTitle} onChange={(e) => setStatTitle(e.target.value)} />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="stat-value">Stat value</Label>
                    <Input id="stat-value" value={statValue} onChange={(e) => setStatValue(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="source-label">Source label</Label>
                    <Input id="source-label" value={sourceLabel} onChange={(e) => setSourceLabel(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stat-context">Context</Label>
                  <Textarea id="stat-context" value={statContext} onChange={(e) => setStatContext(e.target.value)} rows={3} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="caption">Caption</Label>
                  <Textarea
                    id="caption"
                    value={selected.caption ?? ""}
                    onChange={(e) => setCards((prev) => prev.map((card) => card.id === selected.id ? { ...card, caption: e.target.value } : card))}
                    rows={7}
                  />
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <Button type="button" variant="ghost" size="sm" onClick={generateCaption} disabled={generatingCaption}>
                      {generatingCaption ? "Generating…" : "Regenerate AI caption"}
                    </Button>
                    <span>{selected.caption?.length ?? 0} chars</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => updateSelected({ stat_title: statTitle, stat_value: statValue, stat_context: statContext, source_label: sourceLabel, caption: selected.caption } as Partial<StatCard>)} disabled={saving}>
                    {saving ? "Saving…" : "Save edits"}
                  </Button>
                  <Button variant="outline" onClick={renderAndUpload} disabled={rendering || saving}>
                    <Upload className="h-4 w-4 mr-2" /> {rendering ? "Rendering…" : selected.share_url ? "Re-render image" : "Render image"}
                  </Button>
                </div>
                {selected.share_url && (
                  <div className="rounded-md bg-muted p-3 text-sm">
                    Share URL: <a className="text-primary underline" href={selected.share_url} target="_blank" rel="noreferrer">{selected.share_url}</a>
                  </div>
                )}
                <div className="rounded-lg border p-4 space-y-3">
                  <Label>Publish platforms</Label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {platforms.map((platform) => (
                      <label key={platform} className="flex items-center gap-2 rounded-md border p-2 text-sm capitalize">
                        <Checkbox checked={selectedPlatforms.includes(platform)} onCheckedChange={() => togglePlatform(platform)} />
                        {platform}
                      </label>
                    ))}
                  </div>
                  <Button onClick={postSelected} disabled={posting || !selectedPlatforms.length || !selected.caption?.trim()}>
                    <Send className="h-4 w-4 mr-2" /> {posting ? "Posting…" : "Approve & post"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Card preview</CardTitle>
                <CardDescription>Rendered at 2x for a 1080×1080 social image.</CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center overflow-auto">
                <StatCardArtwork
                  card={{ ...selected, stat_title: statTitle, stat_value: statValue, stat_context: statContext, source_label: sourceLabel }}
                  innerRef={cardRef}
                />
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Create a draft to get started.</CardContent></Card>
        )}
      </div>
    </div>
  );
}
