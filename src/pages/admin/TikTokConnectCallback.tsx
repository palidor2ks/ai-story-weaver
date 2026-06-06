import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminRole } from "@/hooks/useAdminRole";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// supabase-js wraps a non-2xx edge response as FunctionsHttpError and hides the
// body behind a generic "non-2xx status code" message. The real reason
// (e.g. token_exchange_failed + TikTok's invalid_request detail) lives on
// `error.context` (the raw Response) — pull it out so the admin can see it.
async function describeFnError(error: unknown): Promise<Error> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.text === "function") {
    try {
      const raw = await ctx.text();
      try {
        const body = JSON.parse(raw) as { error?: unknown; detail?: unknown };
        const parts = [body.error, body.detail]
          .filter((p) => p !== undefined && p !== null && p !== "")
          .map((p) => (typeof p === "string" ? p : JSON.stringify(p)));
        if (parts.length) return new Error(parts.join(" — "));
      } catch {
        if (raw) return new Error(raw);
      }
    } catch {
      /* fall through to the original error */
    }
  }
  return error instanceof Error ? error : new Error("Failed to connect");
}

export default function TikTokConnectCallback() {
  const { data, isLoading } = useAdminRole();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ran = useRef(false);
  const [status, setStatus] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("Finishing TikTok connection…");

  useEffect(() => {
    if (ran.current) return;
    if (isLoading || !data?.isAdmin) return;
    ran.current = true;

    const code = params.get("code");
    const state = params.get("state");
    const err = params.get("error");

    if (err) {
      setStatus("error");
      setMessage(err);
      toast.error("TikTok connection failed", { description: err });
      return;
    }
    if (!code || !state) {
      setStatus("error");
      setMessage("Missing code or state");
      return;
    }

    (async () => {
      try {
        const { data: res, error } = await supabase.functions.invoke("tiktok-oauth-callback", {
          body: { code, state },
        });
        if (error) throw await describeFnError(error);
        if (res?.error) throw new Error(typeof res.error === "string" ? res.error : JSON.stringify(res.error));
        const label = res.display_name ? res.display_name : "account";
        setStatus("done");
        setMessage(`Connected ${label}`);
        toast.success("TikTok account connected", { description: label });
        setTimeout(() => navigate("/admin/tiktok-connect", { replace: true }), 800);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to connect";
        setStatus("error");
        setMessage(msg);
        toast.error("TikTok connection failed", { description: msg });
      }
    })();
  }, [isLoading, data, params, navigate]);

  if (isLoading) return <LoadingScreen />;
  if (!data?.isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="container max-w-md py-16">
      <Card>
        <CardHeader>
          <CardTitle>Connecting TikTok account…</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={status === "error" ? "text-destructive" : "text-muted-foreground"}>
            {message}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
