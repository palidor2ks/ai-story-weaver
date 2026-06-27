// One-shot backfill: resolve stored Gemini grounding-redirect (vertexaisearch) stub URLs
// to their real destinations, in place. The forward fix (resolveGroundedSources dropping
// stubs) only covers NEW answers; this repairs the ~2k answers written before that landed.
//
// Cheap + surgical: it just follows each already-stored redirect token to the real page
// (no Gemini re-research). Cursor-paged + self-chaining so one trigger walks the whole set.
// cron-secret authed (service-role bearer also accepted). Leaves any row it can't resolve
// untouched so it can never violate chk_web_research_has_url or drop real data.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireCronAuth, getCronSecret } from '../_shared/cron-auth.ts';
import { resolveRedirectUrl, isUnresolvedRedirectStub, extractDomainName } from '../_shared/gemini-research.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BATCH = 40;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  const unauthorized = await requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => ({}));
  const afterId: string = body.afterId ?? '00000000-0000-0000-0000-000000000000';
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: rows, error } = await admin.rpc('get_stub_source_answers', { lim: BATCH, after_id: afterId });
  if (error) return json({ error: error.message }, 500);
  if (!rows || rows.length === 0) return json({ done: true, updated: 0, unresolved: 0 });

  let updated = 0, unresolved = 0, lastId = afterId;
  for (const row of rows as Array<Record<string, unknown>>) {
    lastId = row.id as string;
    const urls: string[] = (row.source_urls as string[]) ?? [];
    const titles: string[] = (row.source_titles as string[]) ?? [];

    const kept: { url: string; title: string }[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < urls.length; i++) {
      const u = urls[i];
      const real = u.includes('grounding-api-redirect') ? await resolveRedirectUrl(u) : u;
      if (isUnresolvedRedirectStub(real)) continue;          // couldn't resolve → drop
      if (!real.startsWith('http') || seen.has(real)) continue;
      seen.add(real);
      kept.push({ url: real, title: titles[i] ?? extractDomainName(real) });
    }

    const newUrls = kept.map(k => k.url);
    const scalarIsStub = typeof row.source_url === 'string' && (row.source_url as string).includes('grounding-api-redirect');
    const newScalar = scalarIsStub ? (newUrls[0] ?? null) : (row.source_url as string | null);

    // chk_web_research_has_url: a web_research row must keep >=1 url. If we resolved none,
    // leave the row exactly as-is (better an opaque-but-working stub than a violation).
    if (newUrls.length === 0 && !newScalar && row.source_type === 'web_research') { unresolved++; continue; }
    // nothing actually changed for this row
    if (newUrls.length === urls.length && !scalarIsStub && urls.every(u => !u.includes('grounding-api-redirect'))) continue;

    const { error: upErr } = await admin.from('candidate_answers')
      .update({ source_urls: newUrls, source_titles: kept.map(k => k.title), source_url: newScalar, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (upErr) unresolved++; else updated++;
  }

  // self-chain while batches stay full
  if (rows.length === BATCH) {
    const secret = (await getCronSecret()) ?? '';
    fetch(`${SUPABASE_URL}/functions/v1/resolve-stub-source-urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
      body: JSON.stringify({ afterId: lastId }),
    }).catch(() => {});
  }

  return json({ batch: rows.length, updated, unresolved, lastId, chained: rows.length === BATCH });
});

function json(b: unknown, status = 200): Response {
  return new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
}
