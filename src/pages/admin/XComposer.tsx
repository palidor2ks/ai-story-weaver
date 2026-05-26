import { useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminRole } from "@/hooks/useAdminRole";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const MAX_LEN = 280;

export default function XComposer() {
  const { data, isLoading } = useAdminRole();
  const [text, setText] = useState("");
  const [handle, setHandle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return <LoadingScreen />;
  if (!data?.isAdmin) return <Navigate to="/" replace />;

  const remaining = MAX_LEN - text.length;
  const disabled = submitting || text.trim().length === 0 || text.length > MAX_LEN;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    setSubmitting(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("x-post-tweet", {
        body: {
          text: text.trim(),
          ...(handle.trim() ? { account_handle: handle.trim() } : {}),
        },
      });
      if (error) throw error;
      if (res?.error) throw new Error(typeof res.error === "string" ? res.error : JSON.stringify(res.error));

      const url: string | null = res?.url ?? null;
      toast.success("Tweet posted", {
        description: url ? "Click to view on X" : undefined,
        action: url
          ? { label: "View", onClick: () => window.open(url, "_blank", "noopener,noreferrer") }
          : undefined,
      });
      setText("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to post tweet";
      toast.error("Post failed", { description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>X Tweet Composer</CardTitle>
          <CardDescription>
            Post a tweet from a connected X account. Admin only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="handle">Account handle (optional)</Label>
              <Input
                id="handle"
                placeholder="leave blank to use the default connected account"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                maxLength={50}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="text">Tweet</Label>
              <Textarea
                id="text"
                placeholder="What's happening?"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                disabled={submitting}
              />
              <div
                className={`text-right text-xs ${
                  remaining < 0 ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {remaining}
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={disabled}>
                {submitting ? "Posting…" : "Post tweet"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
