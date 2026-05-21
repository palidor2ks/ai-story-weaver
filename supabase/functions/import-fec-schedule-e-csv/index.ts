// Admin-gated batch upsert for FEC Schedule E (independent expenditures) CSV rows.
// Mirrors the receipts CSV importer: client parses the CSV in the browser and
// streams rows here in batches.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

function pick(row: Record<string, any>, keys: string[]): string | null {
  for (const k of keys) {
    for (const candidate of [k, k.toLowerCase(), k.toUpperCase()]) {
      if (row[candidate] !== undefined && row[candidate] !== null && String(row[candidate]).trim() !== '') {
        return String(row[candidate]).trim();
      }
    }
  }
  // case-insensitive fallback
  const lowerMap: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) lowerMap[k.toLowerCase()] = v;
  for (const k of keys) {
    const v = lowerMap[k.toLowerCase()];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

function parseDate(s: string | null): string | null {
  if (!s) return null;
  // Accept MM/DD/YYYY, YYYY-MM-DD, M/D/YY
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    let [_, mo, d, y] = m;
    if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function parseAmount(s: string | null): number | null {
  if (s === null || s === undefined) return null;
  const n = Number(String(s).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function normalizeSO(s: string | null): 'S' | 'O' | null {
  if (!s) return null;
  const v = s.trim().toUpperCase();
  if (v.startsWith('S')) return 'S';
  if (v.startsWith('O')) return 'O';
  return null;
}

function normalizeRow(row: Record<string, any>) {
  // Prefer sub_id (truly unique FEC bulk-data row id) over tra_id (repeats across amendments)
  const fec_transaction_id = pick(row, ['sub_id', 'SUB_ID', 'tra_id', 'transaction_id', 'fec_transaction_id']);
  const amount = parseAmount(pick(row, ['exp_amo', 'expenditure_amount', 'amount']));
  const support_oppose_indicator = normalizeSO(pick(row, ['sup_opp', 'support_oppose_indicator', 'support_oppose']));
  const spending_committee_fec_id = pick(row, ['spe_id', 'cmte_id', 'fec_committee_id', 'spending_committee_fec_id', 'committee_id']);
  if (!fec_transaction_id || amount === null || !support_oppose_indicator || !spending_committee_fec_id) {
    return null;
  }
  return {
    fec_transaction_id,
    image_number: pick(row, ['image_num', 'image_number']),
    expenditure_date: parseDate(pick(row, ['exp_dat', 'expenditure_dt', 'expenditure_date', 'dissem_dat'])),
    cycle: pick(row, ['fec_election_yr', 'two_year_transaction_period', 'cycle', 'election_year']),
    amount,
    purpose: pick(row, ['pur', 'purpose']),
    communication_type: pick(row, ['cat_code', 'category_code', 'communication_type']),
    support_oppose_indicator,
    spending_committee_fec_id,
    spending_committee_name: pick(row, ['spe_nam', 'committee_name', 'spending_committee_name']),
    target_fec_candidate_id: pick(row, ['can_id', 'cand_id', 'candidate_id', 'target_fec_candidate_id']),
    target_candidate_name: pick(row, ['can_nam', 'can_name', 'cand_name', 'candidate_name', 'target_candidate_name']),
    state: pick(row, ['can_off_sta', 'state', 's']),
    office: pick(row, ['can_off', 'office', 'cand_office']),
    district: pick(row, ['can_off_dis', 'district', 'cand_office_district']),
    election_type: pick(row, ['ele_typ', 'election_type']),
    report_type: pick(row, ['rpt_tp', 'report_type']),
    raw_payload: row,
    source: 'csv_import',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const rows: any[] = Array.isArray(body?.rows) ? body.rows : [];
    const cycleOverride: string | null = body?.cycle ? String(body.cycle) : null;
    const force: boolean = !!body?.force;
    const isFirstBatch: boolean = !!body?.isFirstBatch;
    const isLastBatch: boolean = !!body?.isLastBatch;
    const sessionId: string | null = body?.sessionId ? String(body.sessionId) : null;
    const filename: string | null = body?.filename ? String(body.filename) : null;
    const totalRowCount: number = Number(body?.totalRowCount ?? 0) || 0;
    const finalize: boolean = !!body?.finalize;
    const failed: boolean = !!body?.failed;

    // Finalize-only call (no rows, just close out the session)
    if (sessionId && finalize && rows.length === 0) {
      await admin.from('ie_import_sessions').update({
        status: failed ? 'failed' : 'completed',
        completed_at: new Date().toISOString(),
      }).eq('id', sessionId);
      return new Response(JSON.stringify({ ok: true, finalized: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (rows.length === 0) {
      return new Response(JSON.stringify({ inserted: 0, skipped: 0, totalReceived: 0, unmappedCommittees: [], unmappedCandidates: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Normalize
    const normalized: any[] = [];
    let skippedInvalid = 0;
    const cycleCounts: Record<string, number> = {};
    for (const r of rows) {
      const n = normalizeRow(r);
      if (!n) { skippedInvalid++; continue; }
      if (n.cycle) cycleCounts[n.cycle] = (cycleCounts[n.cycle] || 0) + 1;
      normalized.push(n);
    }

    // Cycle mismatch guardrail (first batch only)
    const detectedCycle = Object.entries(cycleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    if (isFirstBatch && cycleOverride && !force) {
      if (detectedCycle && detectedCycle !== cycleOverride) {
        return new Response(JSON.stringify({ error: 'cycle_mismatch', detected_cycle: detectedCycle, selected_cycle: cycleOverride }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Apply cycle override
    if (cycleOverride) {
      for (const n of normalized) n.cycle = cycleOverride;
    }

    // Create import session on first batch
    if (sessionId && isFirstBatch) {
      await admin.from('ie_import_sessions').upsert({
        id: sessionId,
        cycle: cycleOverride || detectedCycle || 'unknown',
        filename,
        row_count: totalRowCount || rows.length,
        detected_cycle: detectedCycle,
        status: 'running',
        started_at: new Date().toISOString(),
        created_by: user.id,
      }, { onConflict: 'id' });
    }


    // Resolve candidate_id from target_fec_candidate_id via candidate_fec_ids
    const fecCandIds = Array.from(new Set(normalized.map(n => n.target_fec_candidate_id).filter(Boolean))) as string[];
    const fecToCandidate = new Map<string, string>();
    if (fecCandIds.length > 0) {
      const { data: mapRows } = await admin
        .from('candidate_fec_ids')
        .select('fec_candidate_id, candidate_id')
        .in('fec_candidate_id', fecCandIds);
      for (const m of mapRows || []) {
        if (m.candidate_id) fecToCandidate.set(m.fec_candidate_id as string, m.candidate_id as string);
      }
    }

    // Track unmapped
    const unmappedCommittees = new Set<string>();
    const unmappedCandidates = new Set<string>();

    // Check which committees exist
    const committeeIds = Array.from(new Set(normalized.map(n => n.spending_committee_fec_id))) as string[];
    if (committeeIds.length > 0) {
      const { data: knownCom } = await admin
        .from('committees')
        .select('id')
        .in('id', committeeIds);
      const known = new Set((knownCom || []).map(c => c.id as string));
      for (const cid of committeeIds) if (!known.has(cid)) unmappedCommittees.add(cid);
    }

    // Attach candidate_id, session id, and collect unmapped candidates
    const records = normalized.map(n => {
      const candidate_id = n.target_fec_candidate_id ? (fecToCandidate.get(n.target_fec_candidate_id) ?? null) : null;
      if (n.target_fec_candidate_id && !candidate_id) unmappedCandidates.add(n.target_fec_candidate_id);
      return { ...n, candidate_id, import_session_id: sessionId };
    });

    // Upsert in chunks
    const CHUNK = 500;
    let inserted = 0;
    const errors: string[] = [];
    for (let i = 0; i < records.length; i += CHUNK) {
      const slice = records.slice(i, i + CHUNK);
      const { error, count } = await admin
        .from('independent_expenditures')
        .upsert(slice, { onConflict: 'fec_transaction_id,spending_committee_fec_id', count: 'exact' });
      if (error) {
        errors.push(error.message);
      } else {
        inserted += count ?? slice.length;
      }
    }

    // Update session counters / finalize
    if (sessionId) {
      const { data: cur } = await admin
        .from('ie_import_sessions')
        .select('inserted_rows')
        .eq('id', sessionId)
        .maybeSingle();
      const patch: Record<string, any> = {
        inserted_rows: (cur?.inserted_rows ?? 0) + inserted,
      };
      if (isLastBatch) {
        patch.status = errors.length > 0 && inserted === 0 ? 'failed' : 'completed';
        patch.completed_at = new Date().toISOString();
      }
      await admin.from('ie_import_sessions').update(patch).eq('id', sessionId);
    }

    return new Response(JSON.stringify({
      totalReceived: rows.length,
      processed: normalized.length,
      inserted,
      skippedInvalid,
      unmappedCommittees: Array.from(unmappedCommittees),
      unmappedCandidates: Array.from(unmappedCandidates),
      errors,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
