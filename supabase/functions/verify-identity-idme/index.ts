import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const IDME_CLIENT_ID = Deno.env.get('IDME_CLIENT_ID');
const IDME_CLIENT_SECRET = Deno.env.get('IDME_CLIENT_SECRET');
const IDME_BASE_URL = 'https://api.id.me';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the user from the JWT
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Processing ID.me verification for user:', user.id);

    const body = await req.json();
    const { action, code, redirect_uri } = body;

    // Allowlist redirect_uris to prevent OAuth authorization code theft.
    const ALLOWED_REDIRECT_URIS = new Set<string>([
      'https://polipulse.lovable.app/auth/idme-callback',
      'https://polipulseapp.com/auth/idme-callback',
      'https://www.polipulseapp.com/auth/idme-callback',
      'https://id-preview--b4a499eb-c11a-4320-8adc-dfe50259459a.lovable.app/auth/idme-callback',
      'http://localhost:5173/auth/idme-callback',
      'http://localhost:8080/auth/idme-callback',
    ]);
    if (typeof redirect_uri !== 'string' || !ALLOWED_REDIRECT_URIS.has(redirect_uri)) {
      return new Response(JSON.stringify({ error: 'Invalid redirect_uri' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Action: get_auth_url - Generate the ID.me OAuth URL
    if (action === 'get_auth_url') {
      if (!IDME_CLIENT_ID) {
        return new Response(JSON.stringify({ 
          error: 'ID.me not configured',
          message: 'IDME_CLIENT_ID secret is not set. Please configure ID.me credentials.'
        }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const state = crypto.randomUUID();
      const authUrl = `${IDME_BASE_URL}/oauth/authorize?` + new URLSearchParams({
        client_id: IDME_CLIENT_ID,
        redirect_uri: redirect_uri,
        response_type: 'code',
        scope: 'openid',
        state: state,
      }).toString();

      console.log('Generated ID.me auth URL');

      return new Response(JSON.stringify({ 
        auth_url: authUrl,
        state: state
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Action: verify - Exchange code for token and verify
    if (action === 'verify') {
      if (!IDME_CLIENT_ID || !IDME_CLIENT_SECRET) {
        return new Response(JSON.stringify({ 
          error: 'ID.me not configured',
          message: 'ID.me credentials are not set.'
        }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!code) {
        return new Response(JSON.stringify({ error: 'Missing authorization code' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('Exchanging ID.me code for token...');

      // Exchange code for token
      const tokenResponse = await fetch(`${IDME_BASE_URL}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          client_id: IDME_CLIENT_ID,
          client_secret: IDME_CLIENT_SECRET,
          redirect_uri: redirect_uri,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('ID.me token exchange failed:', errorText);
        return new Response(JSON.stringify({ 
          error: 'Verification failed',
          message: 'Failed to verify with ID.me. Please try again.'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const tokenData = await tokenResponse.json();
      console.log('ID.me token received, fetching user info...');

      // Get user info from ID.me
      const userInfoResponse = await fetch(`${IDME_BASE_URL}/api/public/v3/userinfo`, {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
        },
      });

      if (!userInfoResponse.ok) {
        console.error('ID.me userinfo failed:', await userInfoResponse.text());
        return new Response(JSON.stringify({ 
          error: 'Verification failed',
          message: 'Failed to get verification info from ID.me.'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const userInfo = await userInfoResponse.json();
      console.log('ID.me verification successful for user:', user.id);

      // Update the user's profile with verification status
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          identity_verified: true,
          identity_verified_at: new Date().toISOString(),
          identity_provider: 'id.me',
          identity_verification_id: userInfo.uuid || userInfo.sub,
        })
        .eq('id', user.id);

      if (updateError) {
        console.error('Failed to update profile:', updateError);
        return new Response(JSON.stringify({ 
          error: 'Database error',
          message: 'Verification succeeded but failed to update profile.'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ 
        success: true,
        verified: true,
        provider: 'id.me',
        verified_at: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in verify-identity-idme:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
