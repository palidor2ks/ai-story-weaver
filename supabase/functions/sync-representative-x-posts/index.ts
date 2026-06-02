import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BEARER = Deno.env.get('X_BEARER_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BodySchema = z.object({
  candidate_id: z.string().optional(),
  max_candidates: z.number().int().min(1).max(50).optional(),
  per_candidate: z.number().int().min(5).max(50).optional(),
});

interface CandidateRow {
  id: string;
  x_handle: string | null;
}

async function fetchTweets(handle: string, max: number) {
  const userRes = await fetch(
    `https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}`,
    { headers: { Authorization: `Bearer ${BEARER}` } },
  );
  if (!userRes.ok) return { error: `lookup_failed_${userRes.status}`, tweets: [] as any[] };
  const userJson = await userRes.json();
  const userId = userJson?.data?.id;
  if (!userId) return { error: 'user_not_found', tweets: [] as any[] };

  const params = new URLSearchParams({
    max_results: String(max),
    'tweet.fields': 'created_at,public_metrics,entities',
  });
  const tRes = await fetch(
    `https://api.x.com/2/users/${userId}/tweets?${params.toString()}`,
    { headers: { Authorization: `Bearer ${BEARER}` } },
  );
  if (!tRes.ok) return { error: `tweets_failed_${tRes.status}`, tweets: [] as any[] };
  const tJson = await tRes.json();
  return { error: null as string | null, tweets: tJson?.data ?? [] };
}

async function syncCandidate(admin: ReturnType<typeof createClient>, c: CandidateRow, perCandidate: number) {
  if (!c.x_handle) return { candidate_id: c.id, skipped: 'no_handle' };
  const handle = c.x_handle.replace(/^@/, '').trim();
  if (!/^[A-Za-z0-9_]{1,50}$/.test(handle)) return { candidate_id: c.id, skipped: 'invalid_handle' };

  const { error, tweets } = await fetchTweets(handle, perCandidate);
  if (error) return { candidate_id: c.id, error };

  if (tweets.length === 0) return { candidate_id: c.id, inserted: 0 };

  const rows = tweets.map((t: any) => ({
    candidate_id: c.id,
    platform: 'x' as const,
    handle,
    post_id: String(t.id),
    post_url: `https://x.com/${handle}/status/${t.id}`,
    post_text: t.text ?? null,
    posted_at: t.created_at,
    metadata: { public_metrics: t.public_metrics ?? null },
  }));

  const { error: upErr } = await admin
    .from('representative_social_posts')
    .upsert(rows, { onConflict: 'platform,post_id' });
  if (upErr) return { candidate_id: c.id, error: upErr.message };
  return { candidate_id: c.id, inserted: rows.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!BEARER) {
      return new Response(JSON.stringify({ error: 'X_BEARER_TOKEN not configured' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Admin-only
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await admin
      .from('user_roles').select('role').eq('user_id', uid).eq('role', 'admin').maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = req.body ? await req.json().catch(() => ({})) : {};
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { candidate_id, max_candidates = 25, per_candidate = 10 } = parsed.data;

    let candidates: CandidateRow[] = [];
    if (candidate_id) {
      const { data, error } = await admin
        .from('candidates').select('id, x_handle').eq('id', candidate_id).limit(1);
      if (error) throw error;
      candidates = (data ?? []) as CandidateRow[];
    } else {
      const { data, error } = await admin
        .from('candidates').select('id, x_handle')
        .not('x_handle', 'is', null).limit(max_candidates);
      if (error) throw error;
      candidates = (data ?? []) as CandidateRow[];
    }

    const run = async () => {
      const results: any[] = [];
      for (const c of candidates) {
        const r = await syncCandidate(admin, c, per_candidate);
        results.push(r);
        await new Promise((res) => setTimeout(res, 250));
      }
      console.log('sync-representative-x-posts done', JSON.stringify(results));
    };
    // @ts-ignore EdgeRuntime
    EdgeRuntime.waitUntil(run());

    return new Response(JSON.stringify({ ok: true, queued: candidates.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return new Response(JSON.stringify({ error: 'internal', message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
