import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// All stat computation lives in the refresh_admin_stats_cache() SQL function
// (supabase/migrations/20260610170000_admin_stats_auto_refresh.sql) so the dashboard's
// manual refresh, the 15-minute pg_cron job, and the preflight data-accuracy check share
// one set of definitions. This function is just the admin-authenticated trigger.

type StatKey =
  | "voting_records_stats"
  | "candidate_answer_stats"
  | "fec_stats"
  | "bills_stats"
  | "state_finance_stats"
  | "finance_recon_stats"
  | "identity_stats"
  | "all";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Admin auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const adminCheckClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminCheckClient.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { statKey } = await req.json() as { statKey: StatKey };
    console.log(`[refresh-admin-stats] Refreshing: ${statKey}`);

    // Run each key individually so one slow stat (e.g. candidate_answer_stats
    // scanning the full coverage view) can't trip the 60s statement timeout for
    // the whole batch. Errors are collected per-key instead of failing the call.
    const ALL_KEYS: Exclude<StatKey, "all">[] = [
      "voting_records_stats",
      "candidate_answer_stats",
      "fec_stats",
      "bills_stats",
      "state_finance_stats",
      "finance_recon_stats",
      "identity_stats",
    ];
    const keys = statKey === "all" ? ALL_KEYS : [statKey as Exclude<StatKey, "all">];

    const results: Record<string, unknown> = {};
    const errors: Record<string, string> = {};
    for (const key of keys) {
      const { data, error } = await supabase.rpc("refresh_admin_stats_cache", { p_keys: [key] });
      if (error) {
        console.error(`[refresh-admin-stats] ${key} failed:`, error.message);
        errors[key] = error.message;
      } else {
        Object.assign(results, (data as Record<string, unknown>) ?? {});
      }
    }

    if (Object.keys(results).length === 0 && Object.keys(errors).length > 0) {
      return new Response(JSON.stringify({ error: "all keys failed", errors }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, results, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[refresh-admin-stats] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
