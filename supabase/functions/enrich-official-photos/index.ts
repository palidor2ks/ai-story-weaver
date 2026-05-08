import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const BUCKET = 'official-photos';
const MIN_BYTES = 3000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

type Target = {
  table: 'candidates' | 'candidate_overrides';
  id: string;
  pkColumn: string;
  name: string;
  office: string | null;
  state: string | null;
  currentUrl: string | null;
};

function isHostedByUs(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes(`/storage/v1/object/public/${BUCKET}/`);
}

async function askAIForPhoto(t: Target): Promise<string | null> {
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

  const prompt = `Find ONE direct URL to an official portrait photograph of:
Name: ${t.name}
Office: ${t.office ?? 'unknown'}
State: ${t.state ?? 'unknown'}

Requirements:
- Direct image URL (ends in .jpg/.jpeg/.png/.webp), NOT an HTML page.
- Prefer: official .gov sites, state legislature sites, official municipal sites, bioguide.congress.gov, ballotpedia static photo CDN, or Wikimedia Commons (upload.wikimedia.org).
- AVOID: news photos, stock photos, social media, blog posts.
- Return null if you cannot find a verifiably-correct portrait. Do NOT guess.`;

  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-pro',
      messages: [
        { role: 'system', content: 'You return verified official portrait URLs only. Never invent URLs.' },
        { role: 'user', content: prompt },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'return_photo',
          description: 'Return a single official portrait URL or null',
          parameters: {
            type: 'object',
            properties: {
              photo_url: { type: ['string', 'null'] },
              source_page: { type: ['string', 'null'] },
            },
            required: ['photo_url'],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'return_photo' } },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[enrich-photos] AI error ${res.status} for ${t.name}: ${body.slice(0, 200)}`);
    return null;
  }

  const data = await res.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return null;
  try {
    const parsed = JSON.parse(args);
    const url = parsed.photo_url;
    if (typeof url !== 'string' || !url.startsWith('http')) return null;
    return url;
  } catch {
    return null;
  }
}

async function downloadImage(url: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': UA, 'Accept': 'image/*,*/*;q=0.8' },
    });
    if (!res.ok) {
      console.warn(`[enrich-photos] download ${res.status} for ${url}`);
      return null;
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength < MIN_BYTES) {
      console.warn(`[enrich-photos] too small (${buf.byteLength}b) ${url}`);
      return null;
    }
    // Sniff magic bytes if content-type is unhelpful
    let mime = ct.startsWith('image/') ? ct.split(';')[0].trim() : '';
    if (!mime) {
      if (buf[0] === 0xff && buf[1] === 0xd8) mime = 'image/jpeg';
      else if (buf[0] === 0x89 && buf[1] === 0x50) mime = 'image/png';
      else if (buf[0] === 0x47 && buf[1] === 0x49) mime = 'image/gif';
      else if (buf[0] === 0x52 && buf[1] === 0x49) mime = 'image/webp';
      else return null;
    }
    return { bytes: buf, contentType: mime };
  } catch (e) {
    console.warn(`[enrich-photos] download failed ${url}: ${(e as Error).message}`);
    return null;
  }
}

function extFromMime(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  id: string,
  bytes: Uint8Array,
  mime: string,
): Promise<string | null> {
  const ext = extFromMime(mime);
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const path = `${safeId}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: true,
    cacheControl: '604800',
  });
  if (error) {
    console.error(`[enrich-photos] upload failed for ${id}: ${error.message}`);
    return null;
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Cache-bust so the browser refetches if we replaced an existing photo
  return `${data.publicUrl}?v=${Date.now()}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: roleRow } = await supabase
      .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const explicitCandidateId: string | undefined = body.candidateId;
    const mode: 'missing' | 'rehost-all' = body.mode === 'rehost-all' ? 'rehost-all' : 'missing';
    const limit: number = Math.min(Math.max(Number(body.limit) || 25, 1), 100);

    const targets: Target[] = [];

    if (explicitCandidateId) {
      const { data: cand } = await supabase
        .from('candidates').select('id,name,office,state,image_url')
        .eq('id', explicitCandidateId).maybeSingle();
      if (cand && cand.name) {
        targets.push({ table: 'candidates', id: cand.id, pkColumn: 'id', name: cand.name, office: cand.office, state: cand.state, currentUrl: cand.image_url });
      } else {
        const { data: ov } = await supabase
          .from('candidate_overrides').select('candidate_id,name,office,state,image_url')
          .eq('candidate_id', explicitCandidateId).maybeSingle();
        if (ov && ov.name) {
          targets.push({ table: 'candidate_overrides', id: ov.candidate_id, pkColumn: 'candidate_id', name: ov.name, office: ov.office, state: ov.state, currentUrl: ov.image_url });
        }
      }
    } else {
      // Pull overrides FIRST (most likely to have broken/missing URLs)
      let ovQuery = supabase
        .from('candidate_overrides')
        .select('candidate_id,name,office,state,image_url')
        .not('name', 'is', null);
      if (mode === 'missing') {
        ovQuery = ovQuery.or('image_url.is.null,image_url.eq.');
      }
      const { data: ovs } = await ovQuery.limit(limit);
      (ovs || []).forEach((o: any) => {
        if (mode === 'rehost-all' && isHostedByUs(o.image_url)) return;
        targets.push({ table: 'candidate_overrides', id: o.candidate_id, pkColumn: 'candidate_id', name: o.name, office: o.office, state: o.state, currentUrl: o.image_url });
      });

      const remaining = limit - targets.length;
      if (remaining > 0) {
        let cQuery = supabase
          .from('candidates')
          .select('id,name,office,state,image_url')
          .not('name', 'is', null);
        if (mode === 'missing') {
          cQuery = cQuery.or('image_url.is.null,image_url.eq.');
        }
        const { data: cands } = await cQuery.limit(remaining);
        (cands || []).forEach((c: any) => {
          if (mode === 'rehost-all' && isHostedByUs(c.image_url)) return;
          targets.push({ table: 'candidates', id: c.id, pkColumn: 'id', name: c.name, office: c.office, state: c.state, currentUrl: c.image_url });
        });
      }
    }

    if (targets.length === 0) {
      return new Response(JSON.stringify({ message: 'Nothing to process.', updated: 0, attempted: 0, results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: Array<{ id: string; name: string; status: string; url?: string }> = [];
    let updated = 0;

    for (const t of targets) {
      try {
        // Strategy: try the existing URL first (rehost-all), then ask AI for a new one.
        const candidates: string[] = [];
        if (t.currentUrl && !isHostedByUs(t.currentUrl)) candidates.push(t.currentUrl);

        let downloaded: { bytes: Uint8Array; contentType: string } | null = null;
        let sourceUrl: string | null = null;

        for (const u of candidates) {
          downloaded = await downloadImage(u);
          if (downloaded) { sourceUrl = u; break; }
        }

        if (!downloaded) {
          const aiUrl = await askAIForPhoto(t);
          if (aiUrl) {
            downloaded = await downloadImage(aiUrl);
            if (downloaded) sourceUrl = aiUrl;
          }
        }

        if (!downloaded) {
          results.push({ id: t.id, name: t.name, status: 'no_valid_photo_found' });
          continue;
        }

        const publicUrl = await uploadToStorage(supabase, t.id, downloaded.bytes, downloaded.contentType);
        if (!publicUrl) {
          results.push({ id: t.id, name: t.name, status: 'upload_failed', url: sourceUrl ?? undefined });
          continue;
        }

        const { error: upErr } = await supabase
          .from(t.table)
          .update({ image_url: publicUrl })
          .eq(t.pkColumn, t.id);
        if (upErr) {
          results.push({ id: t.id, name: t.name, status: `db_update_failed: ${upErr.message}`, url: publicUrl });
          continue;
        }

        updated++;
        results.push({ id: t.id, name: t.name, status: 'updated', url: publicUrl });
      } catch (e) {
        results.push({ id: t.id, name: t.name, status: `error: ${(e as Error).message}` });
      }
    }

    return new Response(JSON.stringify({ attempted: targets.length, updated, mode, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[enrich-photos] fatal', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
