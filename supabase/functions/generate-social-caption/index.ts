// Admin-only. Generates a caption for a social_posts row + platform using Lovable AI Gateway.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { isCronAuthorized } from '../_shared/cron-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supaUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const aiKey = Deno.env.get('LOVABLE_API_KEY');

const BodySchema = z.object({
  post_id: z.string().uuid(),
  platform: z.enum(['x', 'facebook', 'instagram', 'tiktok']),
});

const limits: Record<string, { max: number; style: string }> = {
  x: { max: 240, style: 'Punchy, ≤240 chars (leave room for a link). Maybe 1-2 hashtags.' },
  facebook: { max: 600, style: 'Conversational, 2-3 sentences. 1-2 hashtags max.' },
  instagram: { max: 800, style: 'Hook line, then context. 4-8 relevant hashtags at end.' },
  tiktok: { max: 280, style: 'Bold hook, 1 sentence + 2-4 trending political hashtags.' },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(supaUrl, serviceKey);

    // Cron / service-role callers (the auto-post pipeline) bypass the user
    // check; everyone else must be an authenticated admin.
    if (!(await isCronAuthorized(req))) {
      const authHeader = req.headers.get('Authorization') ?? '';
      if (!authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const { data: role } = await admin.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
      if (!role) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const { post_id, platform } = parsed.data;

    const { data: post } = await admin.from('social_posts').select('*').eq('id', post_id).maybeSingle();
    if (!post) return new Response(JSON.stringify({ error: 'post_not_found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    if (!aiKey) {
      // fallback caption
      const fallback = `${post.subject_label ?? 'This rep'} on PoliPulse. See where they stand.`;
      await admin.from('social_post_platforms').update({ caption: fallback }).eq('post_id', post_id).eq('platform', platform);
      return new Response(JSON.stringify({ caption: fallback, fallback: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const cfg = limits[platform];
    const stat = post.stat_payload ?? {};
    const prompt = `Write a single social-media caption for ${platform.toUpperCase()} about this U.S. elected official's PoliPulse profile.

Official: ${post.subject_label ?? 'Unknown'}
Party: ${stat.party ?? 'Unknown'}
Office: ${stat.office ?? ''}${stat.state ? ', ' + stat.state : ''}
PoliPulse overall score (range -10 left to +10 right): ${stat.overall_score ?? 'n/a'}

Rules:
- ${cfg.style}
- No emojis except 1 max.
- Neutral, factual, civic tone. Do NOT include a URL (the share link is appended automatically).
- Output plain text only, no quotes, no preamble.
- Max ${cfg.max} characters.`;

    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiKey}` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return new Response(JSON.stringify({ error: 'ai_failed', detail: t.slice(0, 500) }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const j = await res.json();
    let caption: string = j?.choices?.[0]?.message?.content ?? '';
    caption = caption.replace(/^["']|["']$/g, '').trim();
    if (caption.length > cfg.max) caption = caption.slice(0, cfg.max - 1).trimEnd() + '…';

    await admin.from('social_post_platforms').update({ caption }).eq('post_id', post_id).eq('platform', platform);
    return new Response(JSON.stringify({ caption }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
