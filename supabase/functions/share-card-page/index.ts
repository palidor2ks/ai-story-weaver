import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id || !/^[a-z0-9]{4,20}$/.test(id)) {
    return new Response('Bad id', { status: 400, headers: corsHeaders });
  }

  const supaUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supaUrl, serviceKey);

  const { data, error } = await supabase
    .from('share_cards')
    .select('image_path, target_url, og_title, og_description')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    return new Response('Not found', { status: 404, headers: corsHeaders });
  }

  const { data: pub } = supabase.storage.from('share-cards').getPublicUrl(data.image_path);
  const imageUrl = pub.publicUrl;
  const title = escapeHtml(data.og_title);
  const desc = escapeHtml(data.og_description || 'Discover where you stand on the issues.');
  const target = escapeHtml(data.target_url);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<meta name="description" content="${desc}" />

<meta property="og:type" content="website" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${desc}" />
<meta property="og:image" content="${escapeHtml(imageUrl)}" />
<meta property="og:image:width" content="1080" />
<meta property="og:image:height" content="1080" />
<meta property="og:url" content="${target}" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${desc}" />
<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />

<meta http-equiv="refresh" content="0; url=${target}" />
<link rel="canonical" href="${target}" />
</head>
<body>
<p>Redirecting to <a href="${target}">${target}</a>…</p>
<script>location.replace(${JSON.stringify(data.target_url)});</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
});
