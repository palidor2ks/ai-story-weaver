// Fetches House Clerk roll call XML for each bill in question_bill_map,
// parses member positions (bioguide-id → Yea/Nay/Not Voting/Present),
// and bulk-upserts into member_votes.
//
// Edge function runs on Supabase infra which can reach clerk.house.gov.
// Safe to invoke multiple times — upsert is idempotent.
//
// Invoke: POST with { congress?: number, dry_run?: boolean }
//   congress  = limit to a specific congress (omit = all)
//   dry_run   = true → fetch XML + report counts but do not write to DB
//
// Requires cron-secret auth (same pattern as other admin functions).
// After running, verify with:
//   SELECT bill_id, count(*) as members,
//          count(*) FILTER (WHERE position='Yea') as yeas,
//          count(*) FILTER (WHERE position='Nay') as nays
//   FROM member_votes GROUP BY bill_id ORDER BY bill_id;

import { createClient } from 'npm:@supabase/supabase-js@2';

// Inlined from _shared/cron-auth.ts
async function requireCronAuth(req: Request): Promise<Response | null> {
  const url     = Deno.env.get('SUPABASE_URL');
  const key     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const provided = req.headers.get('x-cron-secret');
  if (url && key && provided) {
    try {
      const { data } = await createClient(url, key).rpc('get_cron_secret');
      if (typeof data === 'string' && data.length === provided.length) {
        let diff = 0;
        for (let i = 0; i < data.length; i++) diff |= data.charCodeAt(i) ^ provided.charCodeAt(i);
        if (diff === 0) return null;
      }
    } catch { /* fall through */ }
  }
  const auth = req.headers.get('authorization') ?? '';
  if (key && auth === `Bearer ${key}`) return null;
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
  });
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DELAY_MS      = 600; // courtesy gap between Clerk fetches

interface BillMapRow {
  congress:         number;
  chamber:          string;
  bill_type:        string;
  bill_number:      number;
  roll_call_number: number;
  roll_call_year:   number;
}

interface ParsedVote {
  bioguideId: string;
  position:   string;
}

function buildClerkUrl(year: number, roll: number): string {
  return `https://clerk.house.gov/evs/${year}/roll${String(roll).padStart(3, '0')}.xml`;
}

async function fetchXml(url: string): Promise<string | null> {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'PoliPulse/1.0 data@polipulseapp.com' },
  });
  if (!resp.ok) {
    console.warn(`[fetch-votes] HTTP ${resp.status} for ${url}`);
    return null;
  }
  return resp.text();
}

// Parse House Clerk XML: each <recorded-vote> has bioguide-id attribute + <vote> child.
function parseHouseXml(xml: string): ParsedVote[] {
  const results: ParsedVote[] = [];
  for (const block of xml.matchAll(/<recorded-vote>([\s\S]*?)<\/recorded-vote>/g)) {
    const inner    = block[1];
    const bioguide = inner.match(/name-id="([^"]+)"/)?.[1]?.trim();
    const position = inner.match(/<vote>([^<]+)<\/vote>/)?.[1]?.trim();
    if (bioguide && position) results.push({ bioguideId: bioguide, position });
  }
  return results;
}

async function run(filterCongress: number | null, dryRun: boolean): Promise<object> {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let query = supabase
    .from('question_bill_map')
    .select('congress, chamber, bill_type, bill_number, roll_call_number, roll_call_year')
    .not('roll_call_number', 'is', null)
    .not('roll_call_year',   'is', null)
    .eq('chamber', 'house'); // Senate XML uses lis_member_id; handle separately later

  if (filterCongress) query = query.eq('congress', filterCongress);

  const { data: mappings, error } = await query;
  if (error) throw new Error(`Failed to load question_bill_map: ${error.message}`);

  // Deduplicate: one entry per unique (congress, chamber, roll_call_number, roll_call_year)
  const rollCalls = new Map<string, BillMapRow>();
  for (const row of (mappings ?? []) as BillMapRow[]) {
    const key = `${row.congress}/${row.roll_call_year}/${row.roll_call_number}`;
    if (!rollCalls.has(key)) rollCalls.set(key, row);
  }

  const results: Array<{ key: string; status: string; members?: number; error?: string }> = [];

  for (const [key, rc] of rollCalls) {
    const url = buildClerkUrl(rc.roll_call_year, rc.roll_call_number);
    console.log(`[fetch-votes] ${dryRun ? '[DRY] ' : ''}${key} → ${url}`);

    if (dryRun) {
      results.push({ key, status: 'dry_run', members: 0 });
      continue;
    }

    const xml = await fetchXml(url);
    if (!xml) {
      results.push({ key, status: 'fetch_failed' });
      continue;
    }

    const votes = parseHouseXml(xml);
    if (votes.length === 0) {
      results.push({ key, status: 'parse_failed', error: 'no recorded-vote elements' });
      continue;
    }

    const sourceUrl = url;
    const billId    = `${rc.bill_type}${rc.bill_number}-${rc.congress}`;
    const now       = new Date().toISOString();

    let upsertError: string | null = null;
    for (let i = 0; i < votes.length; i += 200) {
      const batch = votes.slice(i, i + 200).map(v => ({
        candidate_id:  v.bioguideId,
        congress:      rc.congress,
        chamber:       rc.chamber,
        roll_call:     rc.roll_call_number,
        bill_id:       billId,
        position:      v.position,
        source_url:    sourceUrl,
        fetched_at:    now,
      }));
      const { error: uErr } = await supabase
        .from('member_votes')
        .upsert(batch, { onConflict: 'candidate_id,congress,chamber,roll_call' });
      if (uErr) { upsertError = uErr.message; break; }
    }

    results.push(upsertError
      ? { key, status: 'upsert_failed', error: upsertError }
      : { key, status: 'ok', members: votes.length }
    );

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  const totalInserted = results.filter(r => r.status === 'ok').reduce((s, r) => s + (r.members ?? 0), 0);
  return { dry_run: dryRun, roll_calls_processed: rollCalls.size, total_votes_upserted: totalInserted, results };
}

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const unauthorized = await requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => ({}));
  const filterCongress = body?.congress ? Number(body.congress) : null;
  const dryRun         = body?.dry_run === true;

  const resultPromise = run(filterCongress, dryRun).then(data =>
    new Response(JSON.stringify(data), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  ).catch(err =>
    new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  );

  // Run synchronously (fetching ~10 roll calls should complete well within 30s limit)
  return resultPromise;
});
