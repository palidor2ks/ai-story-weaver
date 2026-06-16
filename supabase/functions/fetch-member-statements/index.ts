// Evidence-index drain (production slice 1): walks sitting members' official newsrooms
// and fills public.member_statements — the primary-source statements corpus
// (docs/answers-enrichment-part1b-plan.md §DECIDED; schema in migration 20260611180000).
//
// Spike-earned design (HANDOFF 2026-06-11 4th arc):
//   • bodies come from the RSS content:encoded/description payload FIRST — house.gov
//     bot-walls refuse many direct page fetches; the feed payload sidesteps them.
//   • feed discovery: advertised <link rel=alternate> → common paths → HTML listing
//     fallback (incl. the query-string Senate item-URL pattern).
//   • dedupe on (candidate_id, url) + sha256 content hash.
//   • members are claimed atomically via claim_statement_sync_members() so concurrent
//     invocations can't double-walk; stuck claims expire after an hour.
//   • the edge wall-clock caps one invocation at a few members, so a coverage run
//     self-chains: pass max_chain > 0 and each invocation re-invokes itself (service-role
//     bearer — the escape hatch cron-auth explicitly supports) while work remains.
//
// Scheduled by the owner-approved freshness cron 'fetch-member-statements-6h'
// (migration 20260612013000; guardrail #2 review done 2026-06-12): every 6h with
// {limit:4, max_chain:20}. One-off coverage runs can still be kicked manually via
// pg_net with the vault cron secret.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCronSecret, requireCronAuth } from '../_shared/cron-auth.ts';
import { isStateVisible, loadHiddenStates } from '../_shared/onboard-candidate.ts';
import {
  candidateFeedPaths,
  extractPressLinks,
  extractRssLinks,
  type FeedItem,
  normalizeFeedDate,
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
// SUPABASE_ANON_KEY is a reserved env var the platform always injects into edge
// functions; the chain handoff needs it because the gateway 401s an empty apikey
// header. If it ever goes missing the captured chain diagnostics will say so.
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const LEGISLATORS_URL = 'https://unitedstates.github.io/congress-legislators/legislators-current.json';
const FETCH_TIMEOUT_MS = 8000;  // bot-walled hosts eat the whole budget at 12s — fail faster
const DELAY_MS = 300;
const MAX_LIMIT = 6;            // members per invocation (wall-clock budget)
const MAX_CHAIN = 150;          // hard ceiling on self-chaining depth
const MAX_ITEMS_PER_MEMBER = 40;
const PAGE_FETCH_CAP = 4;       // page-fetch fallbacks per member when the feed has no body
                                // (kept small: a bot-walled member at cap 10 × 12s starved the
                                // whole invocation past the edge wall-clock on the first run)

// SSRF allowlist (security review 2026-06-11): fetched bodies are published into the
// world-readable member_statements table, so every crawl target must be a public
// congressional host — https, no IP literals/localhost, hostname ending in .gov.
// (The pinned legislators dataset on github.io is fetched separately, outside this gate.)
function isAllowedCrawlUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (/^[0-9.]+$/.test(host) || host.includes(':')) return false; // IPv4/IPv6 literals
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  return host.endsWith('.gov');
}

async function get(url: string, opts?: { unrestricted?: boolean }): Promise<{ status: number; text: string } | null> {
  if (!opts?.unrestricted && !isAllowedCrawlUrl(url)) return null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    const resp = await fetch(url, {
      redirect: 'follow',
      signal: ctl.signal,
      headers: { 'User-Agent': 'PoliPulse statements drain (public newsroom indexing)' },
    });
    clearTimeout(t);
    // a redirect may have moved us off the allowlist — re-check before reading the body
    if (!opts?.unrestricted && resp.url && !isAllowedCrawlUrl(resp.url)) {
      await resp.body?.cancel();
      return { status: resp.status, text: '' };
    }
    return { status: resp.status, text: resp.ok ? await resp.text() : '' };
  } catch {
    return null;
  }
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface Legislator {
  id?: { bioguide?: string };
  terms?: Array<{ url?: string }>;
}

async function loadOfficialSites(): Promise<Map<string, string> | null> {
  const resp = await get(LEGISLATORS_URL, { unrestricted: true }); // pinned https origin
  if (!resp || resp.status !== 200) return null;
  const map = new Map<string, string>();
  for (const l of JSON.parse(resp.text) as Legislator[]) {
    const bioguide = l.id?.bioguide;
    const url = l.terms?.[l.terms.length - 1]?.url;
    if (bioguide && url) map.set(bioguide, url);
  }
  return map;
}

interface Discovery {
  items: FeedItem[];
  feedUrl: string | null;
  method: string;
}

async function discover(site: string): Promise<Discovery> {
  const home = await get(site);
  const advertised = home?.text ? extractRssLinks(home.text, site) : [];
  for (const feedUrl of [...advertised, ...candidateFeedPaths(site)]) {
    const resp = await get(feedUrl);
    if (resp && resp.status === 200 && /<(item|entry)[\s>]/i.test(resp.text)) {
      const items = parseFeedItems(resp.text);
      if (items.length > 0) {
        return { items, feedUrl, method: advertised.includes(feedUrl) ? 'rss-advertised' : 'rss-probed' };
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (home?.text) {
    const listingHref = home.text.match(/href="([^"#]*(?:press-releases?|newsroom|news)[^"#]*)"/i)?.[1];
    if (listingHref) {
      const listingUrl = new URL(listingHref, site).toString();
      const listing = await get(listingUrl);
      if (listing && listing.status === 200) {
        return { items: extractPressLinks(listing.text, listingUrl), feedUrl: listingUrl, method: 'html-listing' };
      }
    }
  }
  return { items: [], feedUrl: null, method: 'none' };
}

async function walkMember(
  supabase: ReturnType<typeof createClient>,
  candidateId: string,
  site: string | undefined,
): Promise<void> {
  const sync: Record<string, unknown> = {
    candidate_id: candidateId,
    last_sync_completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    sync_error: null,
  };
  try {
    if (!site) throw new Error('no official site in legislators-current');
    sync.site_url = site;

    const found = await discover(site);
    sync.feed_url = found.feedUrl;
    sync.discovery_method = found.method;
    sync.items_seen = found.items.length;
    if (found.items.length === 0 && found.method === 'none') {
      throw new Error('feed discovery found nothing');
    }

    let inserted = 0;
    let pageFetches = 0;
    for (const item of found.items.slice(0, MAX_ITEMS_PER_MEMBER)) {
      let bodyText = '';
      let bodySource = 'none';
      let httpStatus: number | null = null;
      if (item.bodyHtml && stripHtmlToText(item.bodyHtml).length >= 120) {
        bodyText = stripHtmlToText(item.bodyHtml);
        bodySource = 'rss_payload';
      } else if (pageFetches < PAGE_FETCH_CAP) {
        pageFetches++;
        const page = await get(item.url);
        httpStatus = page?.status ?? null;
        if (page?.text) {
          bodyText = stripHtmlToText(page.text);
          bodySource = bodyText.length > 0 ? 'page_fetch' : 'none';
        }
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }

      const { data } = await supabase
        .from('member_statements')
        .upsert({
          candidate_id: candidateId,
          url: item.url,
          title: item.title.slice(0, 400),
          published_at: normalizeFeedDate(item.publishedAt),
          published_at_raw: item.publishedAt,
          body_text: bodyText.slice(0, 60000),
          body_source: bodySource,
          body_chars: bodyText.length,
          content_hash: bodyText ? await sha256Hex(bodyText) : null,
          source_feed: found.feedUrl,
          discovery_method: found.method,
          http_status: httpStatus,
        }, { onConflict: 'candidate_id,url', ignoreDuplicates: true })
        .select('id');
      if (data && data.length > 0) inserted++;
    }
    sync.items_new = inserted;
  } catch (e) {
    sync.sync_error = String(e).slice(0, 300);
  }
  const { error } = await supabase.from('member_statement_sync').upsert(sync, { onConflict: 'candidate_id' });
  if (error) console.error('[statements] sync upsert failed', candidateId, error);
}

async function runBatch(limit: number, maxChain: number): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: claimed, error } = await supabase.rpc('claim_statement_sync_members', { p_limit: limit });
  if (error) {
    console.error('[statements] claim failed', error);
    return;
  }
  let ids: string[] = (claimed ?? []) as string[];
  console.log(`[statements] claimed ${ids.length} member(s); chain budget ${maxChain}`);
  if (ids.length === 0) return;

  // Visible-states gate: fetch state+office for claimed candidates, then skip
  // hidden-state members. Skipped members have their sync row stamped so the
  // claim RPC sees them as completed and won't re-queue them each hour.
  const hiddenSet = await loadHiddenStates(supabase);
  if (hiddenSet.size > 0) {
    const { data: candMeta } = await supabase
      .from('candidates')
      .select('id, state, office')
      .in('id', ids);
    const metaMap = new Map((candMeta ?? []).map((c) => [c.id, c]));
    const skippedIds: string[] = [];
    const visibleIds: string[] = [];
    for (const id of ids) {
      const meta = metaMap.get(id);
      if (!isStateVisible(meta?.state, hiddenSet, meta?.office ?? '')) {
        skippedIds.push(id);
      } else {
        visibleIds.push(id);
      }
    }
    if (skippedIds.length > 0) {
      console.log(`[statements] ${skippedIds.length} hidden-state rows skipped (visible-states gate)`);
      // Stamp skipped members as completed so they leave the claim queue.
      const now = new Date().toISOString();
      for (const skippedId of skippedIds) {
        await supabase.from('member_statement_sync').upsert(
          { candidate_id: skippedId, last_sync_completed_at: now, updated_at: now, sync_error: null },
          { onConflict: 'candidate_id' },
        );
      }
    }
    ids = visibleIds;
    if (ids.length === 0) {
      console.log('[statements] all claimed members are in hidden states — batch done');
      return;
    }
  }

  const sites = await loadOfficialSites();

  // Walk ONE member, then fire the successor, then walk the rest. The first coverage
  // run proved the edge wall-clock can kill an invocation mid-walk, and a chain call
  // placed at the very end dies with it (the run stalled at 16/541) — while chaining
  // before any work would spawn the whole chain depth at once (a thundering herd on
  // .gov hosts). One bounded walk (~90s worst case with the tightened fetch caps)
  // paces the pipeline AND survives later members killing this instance. Short claims
  // mean the queue is draining — stop chaining.
  await walkMember(supabase, ids[0], sites?.get(ids[0]));

  if (maxChain > 0 && ids.length === limit) {
    // AbortController, NOT AbortSignal.timeout — the latter is missing in this edge
    // runtime and its synchronous TypeError silently killed every chain on run 2.
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    try {
      // apikey + x-cron-secret ONLY — exactly what the working pg_net cron calls send.
      // Run 3 (service bearer alone) and run 4 (bearer + apikey) both 401'd; run 4's
      // captured body named it: the gateway rejects "Conflicting API keys" when the
      // apikey and Authorization headers carry different keys.
      const cronSecret = await getCronSecret();
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/fetch-member-statements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': ANON_KEY,
          ...(cronSecret ? { 'x-cron-secret': cronSecret } : {}),
        },
        body: JSON.stringify({ limit, max_chain: maxChain - 1 }),
        signal: ctl.signal,
      });
      console.log(`[statements] chained (${resp.status}); remaining budget ${maxChain - 1}`);
      // surface non-2xx chain handoffs (incl. the response body — gateway and
      // function 401s are indistinguishable by status alone) in the sync row so a
      // stalled run is diagnosable from SQL even when the request log is flooded
      if (resp.status >= 300) {
        const body = await resp.text().catch(() => '');
        await supabase.from('member_statement_sync')
          .update({ sync_error: `chain handoff got HTTP ${resp.status}: ${body.slice(0, 160)}` })
          .eq('candidate_id', ids[0]);
      } else {
        await resp.body?.cancel();
      }
    } catch (e) {
      console.error('[statements] chain invoke failed', e);
      await supabase.from('member_statement_sync')
        .update({ sync_error: `chain invoke failed: ${String(e).slice(0, 200)}` })
        .eq('candidate_id', ids[0]);
    } finally {
      clearTimeout(t);
    }
  }

  for (const candidateId of ids.slice(1)) {
    await walkMember(supabase, candidateId, sites?.get(candidateId));
  }
  console.log('[statements] batch done');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const unauthorized = await requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body?.limit) || 4, 1), MAX_LIMIT);
  const maxChain = Math.min(Math.max(Number(body?.max_chain) || 0, 0), MAX_CHAIN);

  EdgeRuntime.waitUntil(runBatch(limit, maxChain));
  return new Response(JSON.stringify({ accepted: true, limit, max_chain: maxChain }), {
    status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
