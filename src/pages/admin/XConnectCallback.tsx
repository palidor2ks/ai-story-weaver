import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminRole } from "@/hooks/useAdminRole";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function XConnectCallback() {
  const { data, isLoading } = useAdminRole();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ran = useRef(false);
  const [status, setStatus] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("Finishing X connection…");

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
      toast.error("X connection failed", { description: err });
      return;
    }
    if (!code || !state) {
      setStatus("error");
      setMessage("Missing code or state");
      return;
    }

    (async () => {
      try {
        const { data: res, error } = await supabase.functions.invoke("x-oauth-callback", {
          body: { code, state },
        });
        if (error) throw error;
        if (res?.error) throw new Error(typeof res.error === "string" ? res.error : JSON.stringify(res.error));
        setStatus("done");
        setMessage(`Connected @${res.account_handle}`);
        toast.success("X account connected", { description: `@${res.account_handle}` });
        setTimeout(() => navigate("/admin/x-composer", { replace: true }), 800);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to connect";
        setStatus("error");
        setMessage(msg);
        toast.error("X connection failed", { description: msg });
      }
    })();
  }, [isLoading, data, params, navigate]);

  if (isLoading) return <LoadingScreen />;
  if (!data?.isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="container max-w-md py-16">
      <Card>
        <CardHeader>
          <CardTitle>Connecting X account…</CardTitle>
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
