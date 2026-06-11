// Evidence-index SPIKE (option 2, docs/answers-enrichment-part1b-plan.md §"Where this
// goes next"): ingest a handful of sitting members' official newsrooms end-to-end to
// validate the assumptions before any scale-up — bioguide→site mapping via the canonical
// unitedstates/congress-legislators dataset, feed discovery (advertised RSS → common
// paths → HTML listing fallback), item parsing, and body-text extraction quality.
//
// SPIKE-ONLY: writes the underscore scratch tables _evidence_spike_log /
// _evidence_spike_statements and nothing else. Re-running a candidate clears and
// re-ingests their spike rows. Invoked via pg_net + vault cron secret like the drains.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireCronAuth } from '../_shared/cron-auth.ts';
import {
  candidateFeedPaths,
  extractPressLinks,
  extractRssLinks,
  type FeedItem,
  parseFeedItems,
  stripHtmlToText,
} from '../_shared/evidence-index-utils.ts';

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LEGISLATORS_URL = 'https://unitedstates.github.io/congress-legislators/legislators-current.json';
const FETCH_TIMEOUT_MS = 12000;
const DELAY_MS = 400;
const MAX_CANDIDATES = 8;

async function get(url: string): Promise<{ status: number; text: string } | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    const resp = await fetch(url, {
      redirect: 'follow',
      signal: ctl.signal,
      headers: { 'User-Agent': 'PoliPulse evidence-index spike (contact: admin)' },
    });
    clearTimeout(t);
    return { status: resp.status, text: resp.ok ? await resp.text() : '' };
  } catch {
    return null;
  }
}

interface Legislator {
  id?: { bioguide?: string };
  name?: { official_full?: string };
  terms?: Array<{ url?: string; state?: string; type?: string }>;
}

async function ingestMember(
  supabase: ReturnType<typeof createClient>,
  bioguideToSite: Map<string, { site: string; name: string }>,
  candidateId: string,
  maxItems: number,
): Promise<void> {
  const log: Record<string, unknown> = { candidate_id: candidateId, ran_at: new Date().toISOString() };
  await supabase.from('_evidence_spike_statements').delete().eq('candidate_id', candidateId);
  await supabase.from('_evidence_spike_log').delete().eq('candidate_id', candidateId);

  const mapped = bioguideToSite.get(candidateId);
  if (!mapped) {
    log.error = 'bioguide not found in legislators-current';
    await supabase.from('_evidence_spike_log').insert(log);
    return;
  }
  log.member_name = mapped.name;
  log.site_url = mapped.site;

  // ---- feed discovery: advertised RSS -> common paths -> HTML listing fallback
  let items: FeedItem[] = [];
  let method = '';
  const home = await get(mapped.site);
  log.homepage_status = home?.status ?? null;

  const advertised = home?.text ? extractRssLinks(home.text, mapped.site) : [];
  for (const feedUrl of [...advertised, ...candidateFeedPaths(mapped.site)]) {
    const resp = await get(feedUrl);
    if (resp && resp.status === 200 && /<(item|entry)[\s>]/i.test(resp.text)) {
      items = parseFeedItems(resp.text);
      if (items.length > 0) {
        method = advertised.includes(feedUrl) ? 'rss-advertised' : 'rss-probed';
        log.feed_url = feedUrl;
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  if (items.length === 0 && home?.text) {
    // find a newsroom listing link on the homepage, then scrape release links off it
    const listingHref = home.text.match(/href="([^"#]*(?:press-releases?|newsroom|news)[^"#]*)"/i)?.[1];
    if (listingHref) {
      const listingUrl = new URL(listingHref, mapped.site).toString();
      log.listing_url = listingUrl;
      const listing = await get(listingUrl);
      if (listing && listing.status === 200) {
        items = extractPressLinks(listing.text, listingUrl);
        method = 'html-listing';
      }
    }
  }

  log.discovery_method = method || 'none';
  log.items_found = items.length;

  // ---- fetch item bodies
  let ingested = 0;
  for (const item of items.slice(0, maxItems)) {
    const page = await get(item.url);
    const text = page?.text ? stripHtmlToText(page.text) : '';
    const { error } = await supabase.from('_evidence_spike_statements').insert({
      candidate_id: candidateId,
      member_name: mapped.name,
      url: item.url,
      title: item.title.slice(0, 400),
      published_at_raw: item.publishedAt,
      http_status: page?.status ?? null,
      body_chars: text.length,
      body_text: text.slice(0, 20000),
      method,
    });
    if (!error) ingested++;
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  log.items_ingested = ingested;
  await supabase.from('_evidence_spike_log').insert(log);
}

async function runSpike(candidateIds: string[], maxItems: number): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const legResp = await get(LEGISLATORS_URL);
  if (!legResp || legResp.status !== 200) {
    await supabase.from('_evidence_spike_log').insert({
      candidate_id: '_dataset', error: `legislators-current fetch failed (${legResp?.status ?? 'network'})`,
      ran_at: new Date().toISOString(),
    });
    return;
  }
  const legislators = JSON.parse(legResp.text) as Legislator[];
  const bioguideToSite = new Map<string, { site: string; name: string }>();
  for (const l of legislators) {
    const bioguide = l.id?.bioguide;
    const lastTerm = l.terms?.[l.terms.length - 1];
    if (bioguide && lastTerm?.url) {
      bioguideToSite.set(bioguide, { site: lastTerm.url, name: l.name?.official_full ?? bioguide });
    }
  }
  console.log(`[spike] legislators loaded: ${bioguideToSite.size} with official URLs`);

  for (const candidateId of candidateIds) {
    try {
      await ingestMember(supabase, bioguideToSite, candidateId, maxItems);
    } catch (e) {
      await supabase.from('_evidence_spike_log').upsert(
        { candidate_id: candidateId, error: String(e).slice(0, 300), ran_at: new Date().toISOString() },
        { onConflict: 'candidate_id' },
      );
    }
  }
  console.log('[spike] done');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const unauthorized = await requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => ({}));
  const ids: unknown = body?.candidate_ids;
  const candidateIds = Array.isArray(ids) ? ids.filter((x) => typeof x === 'string').slice(0, MAX_CANDIDATES) : [];
  if (candidateIds.length === 0) {
    return new Response(JSON.stringify({ error: 'candidate_ids (bioguide ids) required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const maxItems = Math.min(Math.max(Number(body?.max_items) || 8, 1), 15);

  EdgeRuntime.waitUntil(runSpike(candidateIds, maxItems));
  return new Response(JSON.stringify({ accepted: true, candidates: candidateIds.length, max_items: maxItems }), {
    status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
