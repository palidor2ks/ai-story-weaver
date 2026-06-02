import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return jsonResponse({ error: "Supabase environment is not configured" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError) {
      console.error("[admin-user-last-logins] Admin role lookup failed:", roleError);
      return jsonResponse({ error: "Unable to verify admin role" }, 500);
    }

    if (!roleData) {
      return jsonResponse({ error: "Forbidden: admin role required" }, 403);
    }

    const lastLogins: Record<string, string | null> = {};
    const perPage = 1000;
    let page = 1;

    while (true) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });

      if (error) {
        console.error("[admin-user-last-logins] Auth user lookup failed:", error);
        return jsonResponse({ error: "Unable to load auth users" }, 500);
      }

      const users = data.users || [];
      users.forEach((authUser) => {
        lastLogins[authUser.id] = authUser.last_sign_in_at || null;
      });

      if (users.length < perPage) break;
      page += 1;
    }

    return jsonResponse({ lastLogins });
  } catch (error) {
    console.error("[admin-user-last-logins] Unexpected error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
