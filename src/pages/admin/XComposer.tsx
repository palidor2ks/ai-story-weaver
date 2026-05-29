import { useEffect, useState } from "react";
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

type ConnectedAccount = {
  id: string;
  account_handle: string;
  expires_at: string | null;
  updated_at: string | null;
};

export default function XComposer() {
  const { data, isLoading } = useAdminRole();
  const [text, setText] = useState("");
  const [handle, setHandle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    const { data: rows, error } = await supabase
      .from("x_account_tokens")
      .select("id, account_handle, expires_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) {
      toast.error("Could not load connected X accounts", { description: error.message });
    } else {
      setAccounts((rows ?? []) as ConnectedAccount[]);
    }
    setLoadingAccounts(false);
  };

  useEffect(() => {
    if (data?.isAdmin) loadAccounts();
  }, [data?.isAdmin]);

  if (isLoading) return <LoadingScreen />;
  if (!data?.isAdmin) return <Navigate to="/" replace />;

  const remaining = MAX_LEN - text.length;
  const disabled = submitting || text.trim().length === 0 || text.length > MAX_LEN;

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const redirectTo = `${window.location.origin}/admin/x-connect/callback`;
      const { data: res, error } = await supabase.functions.invoke("x-oauth-start", {
        body: { redirect_to: redirectTo },
      });
      if (error) throw error;
      if (res?.error) throw new Error(typeof res.error === "string" ? res.error : JSON.stringify(res.error));
      if (!res?.authorize_url) throw new Error("missing authorize_url");
      window.location.assign(res.authorize_url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to start X connection";
      toast.error("Connection failed", { description: msg });
      setConnecting(false);
    }
  };

  const handleDisconnect = async (id: string, h: string) => {
    if (!confirm(`Disconnect @${h}?`)) return;
    const { error } = await supabase.from("x_account_tokens").delete().eq("id", id);
    if (error) {
      toast.error("Disconnect failed", { description: error.message });
      return;
    }
    toast.success(`Disconnected @${h}`);
    loadAccounts();
  };

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
    <div className="container max-w-2xl py-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Connected X accounts</CardTitle>
          <CardDescription>
            Link an X account so PoliPulse can post on its behalf. Requires admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingAccounts ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No X accounts connected yet.</p>
          ) : (
            <ul className="space-y-2">
              {accounts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <div className="font-medium">@{a.account_handle}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.expires_at ? `Token expires ${new Date(a.expires_at).toLocaleString()}` : "No expiry"}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDisconnect(a.id, a.account_handle)}
                  >
                    Disconnect
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button onClick={handleConnect} disabled={connecting}>
            {connecting ? "Redirecting…" : "Connect X account"}
          </Button>
        </CardContent>
      </Card>

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
