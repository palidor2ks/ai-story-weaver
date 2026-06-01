import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const bearer = authHeader.slice('Bearer '.length).trim();
    const isServiceRole = bearer === supabaseServiceKey;

    // Caller auth: allow service-role (cron / wrapper) OR an admin user JWT
    if (!isServiceRole) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const adminCheckClient = createClient(supabaseUrl, supabaseServiceKey);
      const { data: roleData } = await adminCheckClient.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const cycle: string = body.cycle ?? '2024';
    const limit: number = Math.max(1, Math.min(500, Number(body.limit) || 50));
    const scope: string = body.scope ?? 'all'; // 'all' | 'congress_visible'
    const mode: string = body.mode ?? 'all';   // 'all' | 'backfill' | 'refresh'

    console.log('[SYNC-ALL-DONORS]', { cycle, limit, scope, mode });

    // Build candidate selection
    let query = supabase
      .from('candidates')
      .select('id, name, fec_candidate_id, last_donor_sync, office, state')
      .not('fec_candidate_id', 'is', null);

    if (scope === 'congress_visible') {
      // Filter to House/Senate
      query = query.or('office.ilike.%senate%,office.ilike.%house%,office.eq.Senator,office.eq.Representative');

      // Exclude hidden states
      const { data: hidden } = await supabase.from('hidden_states').select('state_code');
      const hiddenCodes = (hidden ?? []).map((h: { state_code: string }) => h.state_code).filter(Boolean);
      if (hiddenCodes.length > 0) {
        query = query.not('state', 'in', `(${hiddenCodes.map((c) => `"${c}"`).join(',')})`);
      }
    }

    if (mode === 'backfill') {
      query = query.is('last_donor_sync', null);
    } else if (mode === 'refresh') {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      query = query.or(`last_donor_sync.is.null,last_donor_sync.lt.${cutoff}`);
    }

    // Compute remaining queue depth (matches selection criteria) before slicing
    let remainingQuery = supabase
      .from('candidates')
      .select('id', { count: 'exact', head: true })
      .not('fec_candidate_id', 'is', null);

    if (scope === 'congress_visible') {
      remainingQuery = remainingQuery.or('office.ilike.%senate%,office.ilike.%house%,office.eq.Senator,office.eq.Representative');
      const { data: hidden } = await supabase.from('hidden_states').select('state_code');
      const hiddenCodes = (hidden ?? []).map((h: { state_code: string }) => h.state_code).filter(Boolean);
      if (hiddenCodes.length > 0) {
        remainingQuery = remainingQuery.not('state', 'in', `(${hiddenCodes.map((c) => `"${c}"`).join(',')})`);
      }
    }
    if (mode === 'backfill') {
      remainingQuery = remainingQuery.is('last_donor_sync', null);
    } else if (mode === 'refresh') {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      remainingQuery = remainingQuery.or(`last_donor_sync.is.null,last_donor_sync.lt.${cutoff}`);
    }

    const { count: queueBefore } = await remainingQuery;

    const { data: candidates, error: fetchError } = await query
      .order('last_donor_sync', { ascending: true, nullsFirst: true })
      .limit(limit);

    if (fetchError) {
      console.error('[SYNC-ALL-DONORS] fetch error:', fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!candidates || candidates.length === 0) {
      return new Response(JSON.stringify({
        success: true, processed: 0, successCount: 0, failedCount: 0,
        totalDonorsImported: 0, totalRaised: 0, errors: [],
        remaining: 0,
        message: `No candidates to sync (scope=${scope}, mode=${mode})`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    type CandidateResult = {
      candidateId: string;
      name: string;
      state: string | null;
      office: string | null;
      fecCandidateId: string | null;
      status: 'success' | 'failed';
      imported: number;
      totalRaised: number;
      durationMs: number;
      error?: string;
      previousSync: string | null;
    };

    const results = { success: 0, failed: 0, partial: 0, totalDonorsImported: 0, totalRaised: 0, errors: [] as string[] };
    const perCandidate: (CandidateResult & { hasMore?: boolean; stoppedDueToTimeout?: boolean })[] = [];
    const fetchFecDonorsUrl = `${supabaseUrl}/functions/v1/fetch-fec-donors`;

    for (const candidate of candidates) {
      const t0 = Date.now();
      const base = {
        candidateId: candidate.id,
        name: candidate.name,
        state: candidate.state ?? null,
        office: candidate.office ?? null,
        fecCandidateId: candidate.fec_candidate_id ?? null,
        previousSync: candidate.last_donor_sync ?? null,
      };
      try {
        const resp = await fetch(fetchFecDonorsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'apikey': anonKey,
          },
          body: JSON.stringify({ candidateId: candidate.id, fecCandidateId: candidate.fec_candidate_id, cycle }),
        });
        const data = await resp.json().catch(() => ({}));
        const durationMs = Date.now() - t0;
        if (!resp.ok) {
          results.failed++;
          const msg = `HTTP ${resp.status} ${data?.error || ''}`.trim();
          results.errors.push(`${candidate.name}: ${msg}`);
          perCandidate.push({ ...base, status: 'failed', imported: 0, totalRaised: 0, durationMs, error: msg });
        } else if (data?.success) {
          const imported = data.imported || 0;
          const totalRaised = data.totalRaised || 0;
          const hasMore = !!data.hasMore;
          const stoppedDueToTimeout = !!data.stoppedDueToTimeout;
          results.totalDonorsImported += imported;
          results.totalRaised += totalRaised;
          if (hasMore) {
            results.partial++;
            results.errors.push(`${candidate.name}: partial — ${imported} donors imported, more pages remain (rerun to continue)`);
            perCandidate.push({ ...base, status: 'success', imported, totalRaised, durationMs, hasMore, stoppedDueToTimeout, error: 'partial (rerun)' });
          } else {
            results.success++;
            perCandidate.push({ ...base, status: 'success', imported, totalRaised, durationMs, hasMore, stoppedDueToTimeout });
          }
        } else {
          results.failed++;
          const msg = data?.error || 'Unknown error';
          results.errors.push(`${candidate.name}: ${msg}`);
          perCandidate.push({ ...base, status: 'failed', imported: 0, totalRaised: 0, durationMs, error: msg });
        }
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        results.failed++;
        results.errors.push(`${candidate.name}: ${msg}`);
        perCandidate.push({ ...base, status: 'failed', imported: 0, totalRaised: 0, durationMs: Date.now() - t0, error: msg });
      }
    }

    // remaining = queue depth before this batch, minus fully completed ones
    const remaining = Math.max(0, (queueBefore ?? candidates.length) - results.success);

    return new Response(JSON.stringify({
      success: true,
      processed: candidates.length,
      successCount: results.success,
      partialCount: results.partial,
      failedCount: results.failed,
      totalDonorsImported: results.totalDonorsImported,
      totalRaised: results.totalRaised,
      errors: results.errors,
      candidates: perCandidate,
      remaining,
      queueBefore: queueBefore ?? null,
      scope, mode, cycle,
      message: `Synced ${results.success}/${candidates.length} fully (${results.partial} partial, ${results.failed} failed). ${results.totalDonorsImported} donors imported. Remaining in queue: ${remaining}.`,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('[SYNC-ALL-DONORS] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
