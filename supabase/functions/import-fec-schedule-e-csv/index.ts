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

    // Dedupe within the batch on (fec_transaction_id, spending_committee_fec_id) — Postgres rejects
    // ON CONFLICT DO UPDATE if the same conflict key appears twice in one statement, which would
    // fail the whole batch. Keep the LAST occurrence (later amendments win over earlier rows).
    const dedupMap = new Map<string, any>();
    for (const r of records) {
      const k = `${r.fec_transaction_id}|${r.spending_committee_fec_id}`;
      dedupMap.set(k, r);
    }
    const dedupedRecords = Array.from(dedupMap.values());
    const intraBatchDuplicates = records.length - dedupedRecords.length;

    // Process in chunks. Pre-check which (tx_id, committee_id) keys already exist so we can:
    //  1) report newRows vs updatedRows accurately
    //  2) keep the ORIGINAL import_session_id on rows that already exist (don't overwrite)
    const CHUNK = 500;
    let newRows = 0;
    let updatedRows = 0;
    let failedBatches = 0;
    const errors: string[] = [];

    for (let i = 0; i < dedupedRecords.length; i += CHUNK) {
      const slice = dedupedRecords.slice(i, i + CHUNK);
      const chunkNum = Math.floor(i / CHUNK) + 1;

      // Find which keys already exist in DB
      const txIds = Array.from(new Set(slice.map(r => r.fec_transaction_id)));
      const cmteIds = Array.from(new Set(slice.map(r => r.spending_committee_fec_id)));
      const existingKeys = new Set<string>();
      const { data: existing, error: selErr } = await admin
        .from('independent_expenditures')
        .select('fec_transaction_id, spending_committee_fec_id')
        .in('fec_transaction_id', txIds)
        .in('spending_committee_fec_id', cmteIds);
      if (selErr) {
        failedBatches++;
        errors.push(`chunk ${chunkNum} lookup: ${selErr.message}`);
        continue;
      }
      for (const r of existing || []) {
        existingKeys.add(`${r.fec_transaction_id}|${r.spending_committee_fec_id}`);
      }

      const inserts: any[] = [];
      const updates: any[] = [];
      for (const r of slice) {
        const k = `${r.fec_transaction_id}|${r.spending_committee_fec_id}`;
        if (existingKeys.has(k)) {
          // Strip import_session_id so we don't overwrite the original owner
          const { import_session_id: _drop, ...rest } = r;
          updates.push(rest);
        } else {
          inserts.push(r);
        }
      }

      if (inserts.length > 0) {
        const { error: insErr, count: insCount } = await admin
          .from('independent_expenditures')
          .insert(inserts, { count: 'exact' });
        if (insErr) {
          failedBatches++;
          errors.push(`chunk ${chunkNum} insert (${inserts.length}): ${insErr.message}`);
        } else {
          newRows += insCount ?? inserts.length;
        }
      }

      if (updates.length > 0) {
        const { error: updErr, count: updCount } = await admin
          .from('independent_expenditures')
          .upsert(updates, { onConflict: 'fec_transaction_id,spending_committee_fec_id', count: 'exact' });
        if (updErr) {
          failedBatches++;
          errors.push(`chunk ${chunkNum} update (${updates.length}): ${updErr.message}`);
        } else {
          updatedRows += updCount ?? updates.length;
        }
      }
    }

    // Update session counters / finalize — count only TRUE new rows owned by this session
    if (sessionId) {
      const { data: cur } = await admin
        .from('ie_import_sessions')
        .select('inserted_rows')
        .eq('id', sessionId)
        .maybeSingle();
      const patch: Record<string, any> = {
        inserted_rows: (cur?.inserted_rows ?? 0) + newRows,
      };
      if (isLastBatch) {
        patch.status = errors.length > 0 && newRows === 0 && updatedRows === 0 ? 'failed' : 'completed';
        patch.completed_at = new Date().toISOString();
      }
      await admin.from('ie_import_sessions').update(patch).eq('id', sessionId);
    }

    return new Response(JSON.stringify({
      totalReceived: rows.length,
      processed: normalized.length,
      deduped: dedupedRecords.length,
      intraBatchDuplicates,
      newRows,
      updatedRows,
      // legacy field for backwards-compat with any callers that still read `inserted`
      inserted: newRows,
      skippedInvalid,
      failedBatches,
      unmappedCommittees: Array.from(unmappedCommittees),
      unmappedCandidates: Array.from(unmappedCandidates),
      errors,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
