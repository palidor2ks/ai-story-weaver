import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Scheduler / wrapper for the visible-congress FEC donor pipeline.
 *
 * Steps per invocation:
 *   1) For visible-congress candidates with no FEC ID, call fetch-fec-candidate-id (defensive).
 *   2) Call sync-all-donors with { scope:'congress_visible', mode, limit }.
 *   3) Log one row to donor_sync_runs.
 *
 * Triggered by: pg_cron (every 10 min for backfill, daily for refresh) OR an admin from the UI.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Auth: admin user OR service-role (pg_cron passes anon — accept that too since this fn
  // does only safe, scoped work and we need pg_cron to invoke it).
  const auth = req.headers.get('Authorization') ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const isServiceOrAnon = bearer === serviceKey || bearer === anonKey;
  let triggeredBy = 'cron';

  if (!isServiceOrAnon) {
    if (!bearer) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: role } = await supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!role) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    triggeredBy = `admin:${user.id}`;
  }

  const body = await req.json().catch(() => ({}));
  const scope: string = body.scope ?? 'congress_visible';
  const mode: string = body.mode ?? 'backfill';
  const limit: number = Math.max(1, Math.min(50, Number(body.limit) || 10));
  const cycle: string = body.cycle ?? '2024';

  const startedAt = new Date().toISOString();

  // Overlap protection: rely on cron not stacking + 150s edge timeout.

  // Step 1 — discover candidates missing FEC IDs (full list for diagnostics, attempt fill for top N)
  let fecIdsFilled = 0;
  const fecIdErrors: string[] = [];
  type MissingFec = { id: string; name: string; state: string | null; office: string | null; attempted: boolean; filled?: boolean; error?: string };
  const missingFec: MissingFec[] = [];
  try {
    let q = supabase
      .from('candidates')
      .select('id, name, state, office')
      .is('fec_candidate_id', null);
    if (scope === 'congress_visible') {
      q = q.or('office.ilike.%senate%,office.ilike.%house%,office.eq.Senator,office.eq.Representative');
      const { data: hidden } = await supabase.from('hidden_states').select('state_code');
      const hiddenCodes = (hidden ?? []).map((h: { state_code: string }) => h.state_code).filter(Boolean);
      if (hiddenCodes.length > 0) {
        q = q.not('state', 'in', `(${hiddenCodes.map((c) => `"${c}"`).join(',')})`);
      }
    }
    const { data: missing } = await q.limit(100);
    const list = missing ?? [];
    const attemptCount = Math.min(5, list.length);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const entry: MissingFec = { id: c.id, name: c.name, state: c.state, office: c.office, attempted: i < attemptCount };
      if (i < attemptCount) {
        try {
          const r = await fetch(`${supabaseUrl}/functions/v1/fetch-fec-candidate-id`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}`, 'apikey': anonKey },
            body: JSON.stringify({ candidateId: c.id, name: c.name, state: c.state, office: c.office }),
          });
          if (r.ok) { fecIdsFilled++; entry.filled = true; }
          else { entry.filled = false; entry.error = `HTTP ${r.status}`; fecIdErrors.push(`${c.name}: HTTP ${r.status}`); }
        } catch (e) {
          entry.filled = false;
          entry.error = e instanceof Error ? e.message : 'err';
          fecIdErrors.push(`${c.name}: ${entry.error}`);
        }
      }
      missingFec.push(entry);
    }
  } catch (e) {
    console.error('[schedule] fec-id step error:', e);
  }

  // Step 2 — run donor sync
  let syncResult: Record<string, unknown> = {};
  let syncError: string | null = null;
  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/sync-all-donors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}`, 'apikey': anonKey },
      body: JSON.stringify({ scope, mode, limit, cycle }),
    });
    syncResult = await r.json().catch(() => ({}));
    if (!r.ok) syncError = `HTTP ${r.status}: ${(syncResult as { error?: string })?.error ?? ''}`;
  } catch (e) {
    syncError = e instanceof Error ? e.message : 'sync-all-donors call failed';
  }

  // Step 3 — log the run
  const errors = [
    ...fecIdErrors.map((e) => ({ step: 'fec_id', message: e })),
    ...((syncResult as { errors?: string[] }).errors ?? []).map((e) => ({ step: 'donor_sync', message: e })),
    ...(syncError ? [{ step: 'donor_sync', message: syncError }] : []),
  ];

  await supabase.from('donor_sync_runs').insert({
    scope,
    mode,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    processed: (syncResult as { processed?: number }).processed ?? 0,
    success_count: (syncResult as { successCount?: number }).successCount ?? 0,
    failed_count: (syncResult as { failedCount?: number }).failedCount ?? 0,
    remaining: (syncResult as { remaining?: number }).remaining ?? null,
    fec_ids_filled: fecIdsFilled,
    triggered_by: triggeredBy,
    errors,
    notes: syncError ?? null,
  });

  return new Response(JSON.stringify({
    ok: !syncError,
    fecIdsFilled,
    missingFec,
    missingFecCount: missingFec.length,
    syncResult,
    error: syncError,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
