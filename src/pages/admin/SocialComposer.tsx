import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { useAdminRole } from "@/hooks/useAdminRole";
import { LoadingScreen } from "@/components/LoadingScreen";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

const platforms = ["facebook", "x", "instagram", "tiktok"] as const;
type Platform = (typeof platforms)[number];
type ContentType = "meme" | "poll" | "announcement" | "ai_generated";

const promptsByType: Record<ContentType, string> = {
  meme: "Create a witty meme-style post with a bold hook, concise body, and a CTA.",
  poll: "Create an engagement post that asks a clear poll question plus 2-4 answer options.",
  announcement: "Create a professional announcement post with key details and a call-to-action.",
  ai_generated: "Create a highly engaging social post with an insight, emotional angle, and CTA.",
};

export default function SocialComposer() {
  const { data, isLoading } = useAdminRole();
  const [topic, setTopic] = useState("");
  const [contentType, setContentType] = useState<ContentType>("announcement");
  const [tone, setTone] = useState("informative");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(["x"]);
  const [generated, setGenerated] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPosting, setIsPosting] = useState(false);

  // Hooks must run before any early return (react-hooks/rules-of-hooks).
  const charCounts = useMemo(() => ({
    x: generated.length,
    facebook: generated.length,
    instagram: generated.length,
    tiktok: generated.length,
  }), [generated]);

  if (isLoading) return <LoadingScreen />;
  if (!data?.isAdmin) return <Navigate to="/" replace />;

  const canGenerate = topic.trim().length > 0 && !isGenerating;
  const canPost = generated.trim().length > 0 && selectedPlatforms.length > 0 && !isPosting;

  const generatePost = async () => {
    if (!canGenerate) return;
    setIsGenerating(true);
    try {
      const prompt = `${promptsByType[contentType]}\nTopic: ${topic}\nTone: ${tone}\nReturn plain text only.`;
      const { data: res, error } = await supabase.functions.invoke("generate-poll-questions", {
        body: { prompt, type: "mc", topic },
      });
      if (error) throw error;
      const payload = res as any;

      const fallback = [
        contentType === "poll" ? `Poll: ${topic}` : `${topic}`,
        contentType === "poll" && payload?.questions?.[0]?.options
          ? payload.questions[0].options.map((o: any, i: number) => `${i + 1}. ${o.text}`).join("\n")
          : "",
        `#PoliPulse #${contentType.replace("_", "")}`,
      ].filter(Boolean).join("\n\n");

      const aiText = payload?.description || payload?.title;
      setGenerated(`${aiText ? `${aiText}\n\n` : ""}${fallback}`.trim());
      toast.success("Post draft generated");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      toast.error("Failed to generate", { description: msg });
    } finally {
      setIsGenerating(false);
    }
  };

  const postToPlatforms = async () => {
    if (!canPost) return;
    setIsPosting(true);
    try {
      const results = await Promise.all(selectedPlatforms.map(async (platform) => {
        if (platform === "x") {
          const { data: res, error } = await supabase.functions.invoke("x-post-tweet", {
            body: { text: generated.trim() },
          });
          if (error) throw new Error(`x: ${error.message}`);
          if ((res as any)?.error) throw new Error(`x: ${(res as any).error}`);
          return { platform, ok: true };
        }

        const { data: res, error } = await supabase.functions.invoke("post-poll-to-social", {
          body: {
            caption: generated.trim(),
            mode: "manual",
            platforms: [platform],
            content_type: contentType,
          },
        });
        if (error || (res as any)?.error) {
          throw new Error(`${platform}: ${error?.message || (res as any)?.error || "failed"}`);
        }
        return { platform, ok: true };
      }));

      toast.success(`Posted successfully to ${results.map(r => r.platform).join(", ")}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Post failed";
      toast.error("Publishing failed", { description: msg });
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Social Media Composer</CardTitle>
          <CardDescription>
            Generate and publish memes, polls, announcements, and AI-generated posts to Facebook, X, Instagram, and TikTok.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="topic">Topic</Label>
              <Input id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Voter registration deadline" />
            </div>
            <div className="space-y-2">
              <Label>Content type</Label>
              <Select value={contentType} onValueChange={(v: ContentType) => setContentType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="meme">Meme</SelectItem>
                  <SelectItem value="poll">Poll</SelectItem>
                  <SelectItem value="announcement">Announcement</SelectItem>
                  <SelectItem value="ai_generated">AI Generated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tone</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="informative">Informative</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="bold">Bold</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Platforms</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {platforms.map((p) => (
                <label key={p} className="flex items-center gap-2 rounded border p-2 cursor-pointer">
                  <Checkbox
                    checked={selectedPlatforms.includes(p)}
                    onCheckedChange={(checked) => {
                      setSelectedPlatforms((prev) => checked ? [...new Set([...prev, p])] : prev.filter((x) => x !== p));
                    }}
                  />
                  <span className="capitalize">{p}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={generatePost} disabled={!canGenerate}>{isGenerating ? "Generating…" : "Generate draft"}</Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="postText">Post draft</Label>
            <Textarea id="postText" rows={10} value={generated} onChange={(e) => setGenerated(e.target.value)} placeholder="Generated content appears here…" />
            <p className="text-xs text-muted-foreground">Character count — X: {charCounts.x} (limit 280), Facebook: {charCounts.facebook}, Instagram: {charCounts.instagram}, TikTok: {charCounts.tiktok}</p>
          </div>

          <div className="flex justify-end">
            <Button onClick={postToPlatforms} disabled={!canPost}>{isPosting ? "Publishing…" : "Publish now"}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
