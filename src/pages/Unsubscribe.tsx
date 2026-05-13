import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

type State =
  | { status: "loading" }
  | { status: "valid" }
  | { status: "already" }
  | { status: "invalid" }
  | { status: "submitting" }
  | { status: "success" }
  | { status: "error"; message: string };

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ status: "invalid" });
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_ANON } }
        );
        const data = await res.json();
        if (!res.ok) {
          setState({ status: "invalid" });
        } else if (data.valid === false && data.reason === "already_unsubscribed") {
          setState({ status: "already" });
        } else if (data.valid) {
          setState({ status: "valid" });
        } else {
          setState({ status: "invalid" });
        }
      } catch {
        setState({ status: "error", message: "Could not validate this link." });
      }
    })();
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setState({ status: "submitting" });
    const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", {
      body: { token },
    });
    if (error) {
      setState({ status: "error", message: error.message });
      return;
    }
    if (data?.success) setState({ status: "success" });
    else if (data?.reason === "already_unsubscribed") setState({ status: "already" });
    else setState({ status: "error", message: "Unsubscribe failed." });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Unsubscribe from PoliPulse emails</CardTitle>
          <CardDescription>
            You're managing email preferences for your address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.status === "loading" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Validating…
            </div>
          )}
          {state.status === "valid" && (
            <>
              <p className="text-sm text-muted-foreground">
                Click below to confirm you no longer want to receive emails from PoliPulse.
              </p>
              <Button onClick={confirm} className="w-full">Confirm unsubscribe</Button>
            </>
          )}
          {state.status === "submitting" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Processing…
            </div>
          )}
          {state.status === "success" && (
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
              <p>You've been unsubscribed. We're sorry to see you go.</p>
            </div>
          )}
          {state.status === "already" && (
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
              <p>This email is already unsubscribed.</p>
            </div>
          )}
          {state.status === "invalid" && (
            <div className="flex items-start gap-2 text-sm">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <p>This unsubscribe link is invalid or has expired.</p>
            </div>
          )}
          {state.status === "error" && (
            <div className="flex items-start gap-2 text-sm">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <p>{state.message}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
