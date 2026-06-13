#!/usr/bin/env bun
// One-time ETL: reads question_bill_map, fetches House Clerk roll call XML for
// each unique roll call, parses member positions, bulk-upserts into member_votes.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=<key> bun scripts/fetch-roll-call-votes.ts
//
// Add --dry-run to print what would be fetched without writing to the DB.
// Add --congress=117 to limit to a specific congress.
// Add --reset to delete existing member_votes before re-fetching (rare; use with care).
//
// After running, verify with:
//   select congress, chamber, roll_call, count(*) as members, count(*) filter (where position='Yea') as yeas
//   from member_votes group by 1,2,3 order by 1,2,3;

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://ornnzinjrcyigazecctf.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args       = process.argv.slice(2);
const DRY_RUN    = args.includes('--dry-run');
const RESET      = args.includes('--reset');
const congressArg = args.find(a => a.startsWith('--congress='));
const FILTER_CONGRESS = congressArg ? parseInt(congressArg.split('=')[1]) : null;
const DELAY_MS   = 800;  // courtesy gap between Clerk fetches

if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

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
  position:   string;  // 'Yea' | 'Nay' | 'Not Voting' | 'Present'
}

// House Clerk XML: https://clerk.house.gov/xml/rolls/{year}/roll{NNN}.xml
// Senate XML (not yet implemented — uses lis_member_id, not bioguide_id)
function buildUrl(chamber: string, year: number, roll: number): string {
  if (chamber === 'house') {
    return `https://clerk.house.gov/evs/${year}/roll${String(roll).padStart(3, '0')}.xml`;
  }
  throw new Error(`Senate XML not yet implemented (chamber=${chamber})`);
}

async function fetchXml(url: string): Promise<string | null> {
  console.log(`  GET ${url}`);
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'PoliPulse/1.0 data@polipulseapp.com' },
  });
  if (!resp.ok) {
    console.error(`  HTTP ${resp.status} ${resp.statusText}`);
    return null;
  }
  return resp.text();
}

// Parse House Clerk roll call XML.
// Each <recorded-vote> contains a <legislator bioguide-id="..."> and <vote>...</vote>.
function parseHouseXml(xml: string): ParsedVote[] {
  const results: ParsedVote[] = [];
  for (const block of xml.matchAll(/<recorded-vote>([\s\S]*?)<\/recorded-vote>/g)) {
    const inner = block[1];
    const bioguide = inner.match(/bioguide-id="([^"]+)"/)?.[1]?.trim();
    const position = inner.match(/<vote>([^<]+)<\/vote>/)?.[1]?.trim();
    if (bioguide && position) {
      results.push({ bioguideId: bioguide, position });
    }
  }
  return results;
}

async function main() {
  let query = supabase
    .from('question_bill_map')
    .select('congress, chamber, bill_type, bill_number, roll_call_number, roll_call_year')
    .not('roll_call_number', 'is', null)
    .not('roll_call_year', 'is', null);

  if (FILTER_CONGRESS) {
    query = query.eq('congress', FILTER_CONGRESS);
  }

  const { data: mappings, error } = await query;
  if (error) { console.error('Failed to load question_bill_map:', error); process.exit(1); }

  // Deduplicate to one row per unique roll call
  const rollCalls = new Map<string, BillMapRow>();
  for (const row of (mappings ?? []) as BillMapRow[]) {
    const key = `${row.congress}/${row.chamber}/${row.roll_call_year}/${row.roll_call_number}`;
    if (!rollCalls.has(key)) rollCalls.set(key, row);
  }

  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Processing ${rollCalls.size} unique roll calls...`);
  if (FILTER_CONGRESS) console.log(`  Congress filter: ${FILTER_CONGRESS}`);

  if (RESET && !DRY_RUN) {
    const keys = [...rollCalls.values()];
    for (const rc of keys) {
      await supabase
        .from('member_votes')
        .delete()
        .eq('congress', rc.congress)
        .eq('chamber', rc.chamber)
        .eq('roll_call', rc.roll_call_number);
    }
    console.log('Existing member_votes rows deleted for these roll calls.');
  }

  let totalUpserted = 0;
  let totalSkipped  = 0;

  for (const [key, rc] of rollCalls) {
    let url: string;
    try {
      url = buildUrl(rc.chamber, rc.roll_call_year, rc.roll_call_number);
    } catch (e) {
      console.warn(`  Skipping ${key}: ${e}`);
      totalSkipped++;
      continue;
    }

    console.log(`\n[${key}] ${rc.bill_type}${rc.bill_number}`);

    if (DRY_RUN) {
      console.log(`  Would fetch: ${url}`);
      continue;
    }

    const xml = await fetchXml(url);
    if (!xml) { totalSkipped++; continue; }

    const votes = parseHouseXml(xml);
    console.log(`  Parsed ${votes.length} member votes`);
    if (votes.length === 0) {
      console.warn('  No votes parsed — check XML format');
      totalSkipped++;
      continue;
    }

    const sourceUrl = url;
    const billId    = `${rc.bill_type}${rc.bill_number}-${rc.congress}`;
    const now       = new Date().toISOString();

    // Upsert in chunks of 200
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
      const { error: upsertErr } = await supabase
        .from('member_votes')
        .upsert(batch, { onConflict: 'candidate_id,congress,chamber,roll_call' });
      if (upsertErr) {
        console.error('  Upsert error:', upsertErr.message);
      } else {
        totalUpserted += batch.length;
      }
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No data was written. Remove --dry-run to execute.');
    return;
  }

  console.log(`\nDone. Upserted ${totalUpserted} votes across ${rollCalls.size - totalSkipped} roll calls.`);

  const { count } = await supabase
    .from('member_votes')
    .select('*', { count: 'exact', head: true });
  console.log(`member_votes total rows: ${count ?? 'unknown'}`);
  console.log('');
  console.log('Next step (Phase 3):');
  console.log('  Run the preview query in docs/answers-enrichment-part2-plan.md §Phase 3');
  console.log('  to eyeball alignment, then apply with the UPDATE statement.');
}

main().catch(e => { console.error(e); process.exit(1); });
