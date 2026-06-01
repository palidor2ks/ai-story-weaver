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
  // Each candidate can take 30s+ and occasionally much longer while the FEC donor
  // importer paginates/retries. Keep scheduled wrapper batches to one candidate so
  // the background task has enough headroom to finish and persist donor_sync_runs
  // instead of surfacing platform HTTP 504s.
  const requestedLimit = Number(body.limit) || 1;
  const limit: number = Math.max(1, Math.min(1, requestedLimit));
  const cycle: string = body.cycle ?? '2024';

  const startedAt = new Date().toISOString();

  // Insert an in-flight run row up front so the UI shows progress immediately.
  const { data: runRow } = await supabase
    .from('donor_sync_runs')
    .insert({
      scope,
      mode,
      started_at: startedAt,
      finished_at: null,
      processed: 0,
      success_count: 0,
      failed_count: 0,
      remaining: null,
      fec_ids_filled: 0,
      triggered_by: triggeredBy,
      errors: [],
      notes: 'running…',
    })
    .select('id')
    .single();
  const runId = runRow?.id as string | undefined;

  // Run the heavy work in the background — sync-all-donors itself can take
  // 30-40s per candidate and would blow the 150s edge idle timeout.
  const work = async () => {
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

    const errors = [
      ...fecIdErrors.map((e) => ({ step: 'fec_id', message: e })),
      ...((syncResult as { errors?: string[] }).errors ?? []).map((e) => ({ step: 'donor_sync', message: e })),
      ...(syncError ? [{ step: 'donor_sync', message: syncError }] : []),
    ];

    const processed = (syncResult as { processed?: number }).processed ?? 0;
    const successCount = (syncResult as { successCount?: number }).successCount ?? 0;
    const failedCount = (syncResult as { failedCount?: number }).failedCount ?? 0;
    const partialCount = (syncResult as { partialCount?: number }).partialCount ?? 0;
    const remaining = (syncResult as { remaining?: number }).remaining ?? null;

    let notes: string;
    if (syncError) notes = `error: ${syncError}`;
    else if (processed === 0) notes = 'completed — no candidates matched selection';
    else if (failedCount > 0 && successCount === 0) notes = `failed: ${failedCount}/${processed}`;
    else if (partialCount > 0) notes = `partial — ${successCount} done, ${partialCount} need rerun, ${failedCount} failed`;
    else notes = `completed — ${successCount}/${processed} synced`;

    const update = {
      finished_at: new Date().toISOString(),
      processed,
      success_count: successCount,
      failed_count: failedCount,
      remaining,
      fec_ids_filled: fecIdsFilled,
      errors,
      notes,
    };
    if (runId) {
      await supabase.from('donor_sync_runs').update(update).eq('id', runId);
    } else {
      await supabase.from('donor_sync_runs').insert({ scope, mode, started_at: startedAt, triggered_by: triggeredBy, ...update });
    }
  };

  // Fire-and-forget so the HTTP response returns in <1s.
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(work());
  } else {
    work().catch((e) => console.error('[schedule] background work error:', e));
  }

  return new Response(JSON.stringify({
    ok: true,
    queued: true,
    runId,
    startedAt,
    message: 'Run started in the background. Watch the run history for updates.',
    // Stub fields so the UI's existing parser does not break.
    fecIdsFilled: 0,
    missingFec: [],
    missingFecCount: 0,
    syncResult: { message: 'Background run started', processed: 0, successCount: 0, failedCount: 0, candidates: [], errors: [] },
    error: null,
  }), { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
