// Fire-and-forget trigger for the donor consolidated materialized-view refresh.
//
// The admin donor-alias flows (attach / detach / delete) used to call
// supabase.rpc('refresh_donor_consolidated_mv') directly from the browser and wait
// for it. That rebuild takes 1-5 minutes, so the request always blew past the 8s API
// timeout and hammered the database. Instead the client now calls this function, which
// returns immediately and runs the (stampede-guarded) refresh in the background via
// EdgeRuntime.waitUntil, so the admin's UI never blocks.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Supabase Edge Runtime background-task API.
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

Deno.serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify the caller is an authenticated admin (matches attach/detach functions).
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(url, service);
    const { data: roleData } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (!roleData) return json({ error: 'Forbidden: admin required' }, 403);

    // Run the refresh in the background; the SQL function coalesces concurrent calls.
    EdgeRuntime.waitUntil((async () => {
      const { error } = await admin.rpc('refresh_donor_consolidated_mv');
      if (error) console.warn('[refresh-donor-mv] background refresh failed:', error.message);
    })());

    return json({ queued: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
