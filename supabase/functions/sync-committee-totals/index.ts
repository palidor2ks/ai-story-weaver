import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FEC_BASE = 'https://api.open.fec.gov/v1';

interface SyncBody {
  cycle?: string;
  roles?: string[];           // e.g. ['joint_fundraising','leadership_pac','external']
  committeeIds?: string[];    // explicit list overrides roles
  limit?: number;             // max committees to process
  onlyMissing?: boolean;      // default true: only committees with no last_sync_date or 0 fec_itemized_total
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const fecKey = Deno.env.get('FEC_API_KEY');

  try {
    // Admin auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const token = authHeader.slice(7);
    const isServiceRole = token === supabaseServiceKey;

    if (!isServiceRole) {
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: 'Unauthorized' }, 401);

      const adminCheck = createClient(supabaseUrl, supabaseServiceKey);
      const { data: roleData } = await adminCheck
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      if (!roleData) return json({ error: 'Forbidden: admin role required' }, 403);
    }

    if (!fecKey) return json({ error: 'FEC_API_KEY not configured' }, 500);

    const body: SyncBody = await req.json().catch(() => ({}));
    const cycle = body.cycle || '2024';
    const limit = Math.min(Math.max(body.limit ?? 100, 1), 500);
    const roles = body.roles && body.roles.length > 0
      ? body.roles
      : ['joint_fundraising', 'leadership_pac', 'external'];
    const onlyMissing = body.onlyMissing !== false;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Select committees to sync
    let query = supabase
      .from('candidate_committees')
      .select('id, fec_committee_id, name, role, last_sync_date, fec_itemized_total, cycles')
      .not('fec_committee_id', 'is', null);

    if (body.committeeIds && body.committeeIds.length > 0) {
      query = query.in('fec_committee_id', body.committeeIds);
    } else {
      query = query.in('role', roles);
      if (onlyMissing) {
        query = query.is('last_sync_date', null);
      }
    }

    const { data: committees, error: fetchErr } = await query.limit(limit);
    if (fetchErr) return json({ error: fetchErr.message }, 500);

    if (!committees || committees.length === 0) {
      return json({
        success: true,
        processed: 0,
        successCount: 0,
        failedCount: 0,
        message: 'No committees match the selection',
      });
    }

    // Dedupe by fec_committee_id (multiple rows can exist for same committee)
    const uniqueCommittees = Array.from(
      new Map(committees.map((c) => [c.fec_committee_id, c])).values(),
    );

    const results = {
      success: 0,
      failed: 0,
      totalReceipts: 0,
      totalItemized: 0,
      errors: [] as string[],
    };

    for (const c of uniqueCommittees) {
      try {
        const url = `${FEC_BASE}/committee/${c.fec_committee_id}/totals/?api_key=${fecKey}&cycle=${cycle}&per_page=1`;
        const resp = await fetch(url);
        if (!resp.ok) {
          results.failed++;
          results.errors.push(`${c.fec_committee_id}: FEC HTTP ${resp.status}`);
          continue;
        }
        const data = await resp.json();
        const row = data.results?.[0];

        const receipts = Math.round(Number(row?.receipts) || 0);
        const itemized =
          Math.round(Number(row?.individual_itemized_contributions) || 0) +
          Math.round(Number(row?.other_political_committee_contributions) || 0);
        const contribCount = Number(row?.individual_itemized_contributions_count) || null;

        // Update all rows for this committee (could be linked to multiple candidates)
        const updatePayload: Record<string, unknown> = {
          fec_itemized_total: itemized || receipts || 0,
          last_sync_date: new Date().toISOString(),
          last_cycle: cycle,
        };
        // Merge cycle into cycles array
        const existingCycles = Array.isArray(c.cycles) ? c.cycles : [];
        if (!existingCycles.includes(cycle)) {
          updatePayload.cycles = [...existingCycles, cycle];
        }

        const { error: updErr } = await supabase
          .from('candidate_committees')
          .update(updatePayload)
          .eq('fec_committee_id', c.fec_committee_id);

        if (updErr) {
          results.failed++;
          results.errors.push(`${c.fec_committee_id}: ${updErr.message}`);
          continue;
        }

        // Also write a rollup row tagged to whatever candidate this committee links to (if any).
        // Skip if candidate_id is null — the directory falls back to fec_itemized_total in that case.
        const { data: linked } = await supabase
          .from('candidate_committees')
          .select('candidate_id')
          .eq('fec_committee_id', c.fec_committee_id)
          .not('candidate_id', 'is', null);

        if (linked && linked.length > 0) {
          const candId = linked[0].candidate_id;
          await supabase
            .from('committee_finance_rollups')
            .upsert({
              committee_id: c.fec_committee_id,
              candidate_id: candId,
              cycle,
              fec_total_receipts: receipts,
              fec_itemized: itemized,
              contribution_count: contribCount,
              last_fec_check: new Date().toISOString(),
            }, { onConflict: 'committee_id,cycle' });
        }

        results.success++;
        results.totalReceipts += receipts;
        results.totalItemized += itemized;

        // Rate limit: ~5 req/sec to stay under FEC quota
        await new Promise((r) => setTimeout(r, 200));
      } catch (err) {
        results.failed++;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        results.errors.push(`${c.fec_committee_id}: ${msg}`);
      }
    }

    return json({
      success: true,
      processed: uniqueCommittees.length,
      successCount: results.success,
      failedCount: results.failed,
      totalReceipts: results.totalReceipts,
      totalItemized: results.totalItemized,
      errors: results.errors,
      message: `Synced ${results.success}/${uniqueCommittees.length} committees · $${results.totalReceipts.toLocaleString()} in receipts`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
