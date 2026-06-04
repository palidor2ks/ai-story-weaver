// Renders the server-side stat card for a social_posts row and stores it
// (share_url / image_url / share_card_id). Callable by an admin (manual /
// testing) or by cron/service-role (the auto-post pipeline).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { renderAndStoreCard } from '../_shared/social-card.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const supaUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

const BodySchema = z.object({ post_id: z.string().uuid() });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const admin = createClient(supaUrl, serviceKey);

    // Auth: cron/service-role OR an authenticated admin user.
    let authorized = await isCronAuthorized(req);
    if (!authorized) {
      const authHeader = req.headers.get('Authorization') ?? '';
      if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
      const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: 'unauthorized' }, 401);
      const { data: role } = await admin
        .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
      if (!role) return json({ error: 'forbidden' }, 403);
      authorized = true;
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const { data: post } = await admin
      .from('social_posts')
      .select('id, subject_id, subject_label')
      .eq('id', parsed.data.post_id)
      .maybeSingle();
    if (!post) return json({ error: 'post_not_found' }, 404);

    const result = await renderAndStoreCard(admin, post);
    return json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return json({ error: 'render_failed', message }, 500);
  }
});
