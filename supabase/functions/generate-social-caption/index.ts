// Admin-only. Generates a caption for a social_posts row + platform using Lovable AI Gateway.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { readCache } from '../_shared/ai-cache.ts';

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
  // ~200 so the summary + the appended profile link (~76 chars incl. the UUID)
  // stays under X's 280 cap without post-social-card hard-trimming it mid-word.
  x: { max: 200, style: 'Punchy, ≤200 chars (leave room for a link).' },
  facebook: { max: 600, style: 'Conversational, 2-3 sentences. 1-2 hashtags max.' },
  instagram: { max: 800, style: 'Hook line, then context. 4-8 relevant hashtags at end.' },
  tiktok: { max: 280, style: 'Bold hook, 1 sentence + 2-4 trending political hashtags.' },
};

// Condense a longer analysis summary to a social-friendly snippet: trim to the
// last complete sentence that fits (when one lands past the halfway mark), else
// to a word boundary with an ellipsis. Always returns <= maxChars.
function summarizeForSocial(text: string | null | undefined, maxChars: number): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  const head = clean.slice(0, maxChars + 1);
  let sentenceCut = -1;
  for (const m of head.matchAll(/[.!?](?=\s|$)/g)) {
    if (m.index !== undefined && m.index < maxChars) sentenceCut = m.index + 1;
  }
  if (sentenceCut >= Math.floor(maxChars * 0.5)) {
    return clean.slice(0, sentenceCut).trim();
  }
  const wordWindow = clean.slice(0, maxChars - 1);
  const lastSpace = wordWindow.lastIndexOf(' ');
  const base = (lastSpace > 0 ? wordWindow.slice(0, lastSpace) : wordWindow).replace(/[\s,;:.!?-]+$/, '');
  return `${base}…`;
}

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

    const cfg = limits[platform];
    const stat = post.stat_payload ?? {};

    // Prefer the candidate's existing AI analysis summary — the same web-grounded
    // analysis shown on the profile — so the post text *is* that analysis, just
    // condensed to fit. `subject_id` is the candidate id for rep_profile drafts.
    if (post.subject_type === 'rep_profile' && post.subject_id) {
      const cached = await readCache<{ summary?: string; insufficient_information?: boolean }>({
        kind: 'recipient',
        subject_id: `v2:candidate:${post.subject_id}`,
        cycle: null,
      });
      const summary = cached?.payload?.summary;
      if (cached?.payload && !cached.payload.insufficient_information && typeof summary === 'string' && summary.trim()) {
        const caption = summarizeForSocial(summary, cfg.max);
        await admin.from('social_post_platforms').update({ caption }).eq('post_id', post_id).eq('platform', platform);
        return new Response(JSON.stringify({ caption, source: 'ai_analysis' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (!aiKey) {
      // fallback caption
      const fallback = `${post.subject_label ?? 'This rep'} on PoliPulse. See where they stand.`;
      await admin.from('social_post_platforms').update({ caption: fallback }).eq('post_id', post_id).eq('platform', platform);
      return new Response(JSON.stringify({ caption: fallback, fallback: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // No cached analysis available — generate a concise, neutral analysis-style
    // summary with the fast model so the post still reads like an analysis blurb.
    const prompt = `Write a concise, neutral analysis summary of this U.S. elected official for a ${platform.toUpperCase()} post.

Official: ${post.subject_label ?? 'Unknown'}
Party: ${stat.party ?? 'Unknown'}
Office: ${stat.office ?? ''}${stat.state ? ', ' + stat.state : ''}
PoliPulse overall score (range -10 left to +10 right): ${stat.overall_score ?? 'n/a'}

Rules:
- 2-3 short sentences summarizing who they are and their political profile / what they're best known for.
- Factual, nonpartisan, civic tone. No emojis. No hashtags.
- Do NOT include a URL (the share link is appended automatically).
- Output plain text only, no quotes, no preamble.
- Keep it under ${cfg.max} characters.`;

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
    caption = summarizeForSocial(caption, cfg.max);

    await admin.from('social_post_platforms').update({ caption }).eq('post_id', post_id).eq('platform', platform);
    return new Response(JSON.stringify({ caption }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
