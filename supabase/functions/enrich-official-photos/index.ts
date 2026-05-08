import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

type Target = {
  table: 'candidates' | 'candidate_overrides';
  id: string;          // primary key value to match
  pkColumn: string;    // 'id' for candidates, 'candidate_id' for overrides
  name: string;
  office: string | null;
  state: string | null;
};

async function askAIForPhoto(t: Target): Promise<string | null> {
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

  const prompt = `Find ONE direct URL to an official portrait photograph of:
Name: ${t.name}
Office: ${t.office ?? 'unknown'}
State: ${t.state ?? 'unknown'}

Requirements:
- Must be a direct URL ending in .jpg/.jpeg/.png/.webp (no HTML pages).
- Prefer official government sites (.gov, .us, official municipal/state legislature sites) or Wikimedia Commons.
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

async function validateImage(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') || '';
    return ct.startsWith('image/');
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Auth (admin-only)
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
    const limit: number = Math.min(Math.max(Number(body.limit) || 25, 1), 100);

    // Build target list
    const targets: Target[] = [];

    if (explicitCandidateId) {
      const { data: cand } = await supabase
        .from('candidates').select('id,name,office,state,image_url')
        .eq('id', explicitCandidateId).maybeSingle();
      if (cand && cand.name) {
        targets.push({ table: 'candidates', id: cand.id, pkColumn: 'id', name: cand.name, office: cand.office, state: cand.state });
      } else {
        const { data: ov } = await supabase
          .from('candidate_overrides').select('candidate_id,name,office,state')
          .eq('candidate_id', explicitCandidateId).maybeSingle();
        if (ov && ov.name) {
          targets.push({ table: 'candidate_overrides', id: ov.candidate_id, pkColumn: 'candidate_id', name: ov.name, office: ov.office, state: ov.state });
        }
      }
    } else {
      const { data: cands } = await supabase
        .from('candidates')
        .select('id,name,office,state')
        .or('image_url.is.null,image_url.eq.')
        .not('name', 'is', null)
        .limit(limit);
      (cands || []).forEach((c: any) =>
        targets.push({ table: 'candidates', id: c.id, pkColumn: 'id', name: c.name, office: c.office, state: c.state })
      );

      const remaining = limit - targets.length;
      if (remaining > 0) {
        const { data: ovs } = await supabase
          .from('candidate_overrides')
          .select('candidate_id,name,office,state')
          .or('image_url.is.null,image_url.eq.')
          .not('name', 'is', null)
          .limit(remaining);
        (ovs || []).forEach((o: any) =>
          targets.push({ table: 'candidate_overrides', id: o.candidate_id, pkColumn: 'candidate_id', name: o.name, office: o.office, state: o.state })
        );
      }
    }

    if (targets.length === 0) {
      return new Response(JSON.stringify({ message: 'No candidates with missing photos.', updated: 0, attempted: 0, results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: Array<{ id: string; name: string; status: string; url?: string }> = [];
    let updated = 0;

    for (const t of targets) {
      try {
        const url = await askAIForPhoto(t);
        if (!url) {
          results.push({ id: t.id, name: t.name, status: 'no_photo_found' });
          continue;
        }
        const ok = await validateImage(url);
        if (!ok) {
          results.push({ id: t.id, name: t.name, status: 'invalid_url', url });
          continue;
        }
        const { error: upErr } = await supabase
          .from(t.table)
          .update({ image_url: url })
          .eq(t.pkColumn, t.id);
        if (upErr) {
          results.push({ id: t.id, name: t.name, status: `update_failed: ${upErr.message}`, url });
          continue;
        }
        updated++;
        results.push({ id: t.id, name: t.name, status: 'updated', url });
      } catch (e) {
        results.push({ id: t.id, name: t.name, status: `error: ${(e as Error).message}` });
      }
    }

    return new Response(JSON.stringify({ attempted: targets.length, updated, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[enrich-photos] fatal', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
