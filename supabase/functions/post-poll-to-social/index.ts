import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function postToFacebook(_text: string, _link: string) {
  throw new Error('not_configured: Facebook Page credentials (FB_PAGE_ACCESS_TOKEN, FB_PAGE_ID) not set');
}
async function postToLinkedIn(_text: string, _link: string) {
  throw new Error('not_configured: LinkedIn credentials (LINKEDIN_ACCESS_TOKEN, LINKEDIN_ORG_URN) not set');
}
async function postToInstagram(_text: string, _imageUrl: string) {
  throw new Error('not_configured: Instagram requires FB Business + IG_USER_ID + access token');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('unauthorized');

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error('unauthorized');

    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: userId, _role: 'admin' });
    if (!isAdmin) throw new Error('forbidden: admin only');

    const { pollId, platforms } = await req.json();
    if (!pollId || !Array.isArray(platforms) || platforms.length === 0) {
      throw new Error('pollId and platforms[] are required');
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: poll, error: pollErr } = await admin
      .from('polls').select('*').eq('id', pollId).single();
    if (pollErr || !poll) throw new Error('poll not found');

    const origin = req.headers.get('origin') || 'https://polipulseapp.com';
    const link = `${origin}/p/${poll.slug}`;
    const caption = poll.share_caption?.trim() || `${poll.title} — Take the poll: ${link}`;

    const results: any[] = [];
    for (const platform of platforms) {
      try {
        let result: { id: string; url: string };
        if (platform === 'facebook') {
          result = await postToFacebook(caption, link) as any;
        } else if (platform === 'linkedin') {
          result = await postToLinkedIn(caption, link) as any;
        } else if (platform === 'instagram') {
          result = await postToInstagram(caption, poll.og_image_url || '') as any;
        } else {
          throw new Error(`unknown platform: ${platform}`);
        }
        await admin.from('poll_social_posts').insert({
          poll_id: pollId, platform, status: 'success',
          remote_post_id: result.id, remote_post_url: result.url, posted_at: new Date().toISOString(),
        });
        results.push({ platform, status: 'success', url: result.url });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await admin.from('poll_social_posts').insert({
          poll_id: pollId, platform, status: 'failed', error: msg, posted_at: new Date().toISOString(),
        });
        results.push({ platform, status: 'failed', error: msg });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
