import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminRole } from "@/hooks/useAdminRole";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ConnectedAccount = {
  id: string;
  open_id: string;
  display_name: string | null;
  avatar_url: string | null;
  expires_at: string | null;
  updated_at: string | null;
};

export default function TikTokConnect() {
  const { data, isLoading } = useAdminRole();
  const [connecting, setConnecting] = useState(false);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    const { data: rows, error } = await supabase
      .from("tiktok_account_tokens")
      .select("id, open_id, display_name, avatar_url, expires_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) {
      toast.error("Failed to load TikTok accounts", { description: error.message });
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

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const redirect_to = `${window.location.origin}/admin/tiktok-connect/callback`;
      const { data: res, error } = await supabase.functions.invoke("tiktok-oauth-start", { body: { redirect_to } });
      if (error) throw error;
      if (res?.error) throw new Error(typeof res.error === "string" ? res.error : JSON.stringify(res.error));
      if (!res?.authorize_url) throw new Error("missing authorize_url");
      window.location.assign(res.authorize_url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to start TikTok connection";
      toast.error("Connection failed", { description: msg });
      setConnecting(false);
    }
  };

  const handleDisconnect = async (id: string, label: string) => {
    if (!confirm(`Disconnect ${label}?`)) return;
    const { error } = await supabase.from("tiktok_account_tokens").delete().eq("id", id);
    if (error) {
      toast.error("Disconnect failed", { description: error.message });
      return;
    }
    toast.success(`Disconnected ${label}`);
    loadAccounts();
  };

  return (
    <div className="container max-w-2xl py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">TikTok</h1>
        <Button asChild variant="outline" size="sm"><Link to="/admin/social-posts">← Social Posts</Link></Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connected TikTok accounts</CardTitle>
          <CardDescription>
            Link a TikTok account so PoliPulse can post rendered cards on its behalf. Requires admin.
            Cards are published as single-photo posts via the Content Posting API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingAccounts ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No TikTok accounts connected yet.</p>
          ) : (
            <ul className="space-y-2">
              {accounts.map((a) => {
                const label = a.display_name ?? a.open_id;
                return (
                  <li
                    key={a.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="flex items-center gap-3">
                      {a.avatar_url && (
                        <img src={a.avatar_url} alt="" className="h-8 w-8 rounded-full" />
                      )}
                      <div>
                        <div className="font-medium">{label}</div>
                        <div className="text-xs text-muted-foreground">
                          {a.expires_at ? `Token expires ${new Date(a.expires_at).toLocaleString()}` : "No expiry"}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDisconnect(a.id, label)}
                    >
                      Disconnect
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          <Button onClick={handleConnect} disabled={connecting}>
            {connecting ? "Redirecting…" : "Connect TikTok account"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>TikTok app requirements</CardTitle>
          <CardDescription>One-time setup in the TikTok for Developers portal.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Add the <strong>Login Kit</strong> and <strong>Content Posting API</strong> products, with the <code>user.info.basic</code> and <code>video.publish</code> scopes enabled.</p>
          <p>• Register this redirect URI: <code>{`${window.location.origin}/admin/tiktok-connect/callback`}</code></p>
          <p>• Verify the domain that serves the rendered card images under the app's <strong>URL properties</strong> (required for pull-from-URL posting).</p>
          <p>• Until the app passes TikTok's audit, posts are limited to private (<code>SELF_ONLY</code>) visibility; we automatically use the safest level each account allows.</p>
        </CardContent>
      </Card>
    </div>
  );
}
