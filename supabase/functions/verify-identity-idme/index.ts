import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_ALLOWED_REDIRECT_URIS = [
  'https://polipulse.lovable.app/auth/idme-callback',
  'https://polipulseapp.com/auth/idme-callback',
  'https://www.polipulseapp.com/auth/idme-callback',
  'https://id-preview--b4a499eb-c11a-4320-8adc-dfe50259459a.lovable.app/auth/idme-callback',
  'http://localhost:5173/auth/idme-callback',
  'http://localhost:8080/auth/idme-callback',
];

const IDME_CLIENT_ID = Deno.env.get('IDME_CLIENT_ID');
const IDME_CLIENT_SECRET = Deno.env.get('IDME_CLIENT_SECRET');
const IDME_BASE_URL = normalizeBaseUrl(Deno.env.get('IDME_BASE_URL') || 'https://api.id.me');
const IDME_SCOPE = normalizeScope(Deno.env.get('IDME_SCOPE') || 'openid');
const ALLOWED_REDIRECT_URIS = buildAllowedRedirectUris();

type JsonRecord = Record<string, unknown>;

const jsonResponse = (body: JsonRecord, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function normalizeScope(scope: string): string {
  const scopes = scope.split(/\s+/).map((value) => value.trim()).filter(Boolean);
  if (!scopes.includes('openid')) {
    scopes.unshift('openid');
  }
  return [...new Set(scopes)].join(' ');
}

function buildAllowedRedirectUris(): Set<string> {
  const envUris = (Deno.env.get('IDME_ALLOWED_REDIRECT_URIS') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return new Set([...DEFAULT_ALLOWED_REDIRECT_URIS, ...envUris]);
}

function endpoint(path: string): string {
  return new URL(path, `${IDME_BASE_URL}/`).toString();
}

async function parseJsonBody(req: Request): Promise<JsonRecord> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body as JsonRecord : {};
  } catch {
    return {};
  }
}

function decodeJwtPayload(token: unknown): JsonRecord | null {
  if (typeof token !== 'string') return null;

  const [, payload] = token.split('.');
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const json = new TextDecoder().decode(Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)));
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonRecord : null;
  } catch (error) {
    console.error('Failed to decode ID.me JWT payload:', error);
    return null;
  }
}

function attributesArrayToRecord(attributes: unknown): JsonRecord {
  if (!Array.isArray(attributes)) return {};

  return attributes.reduce<JsonRecord>((acc, attribute) => {
    if (!attribute || typeof attribute !== 'object') return acc;
    const { handle, value } = attribute as { handle?: unknown; value?: unknown };
    if (typeof handle === 'string') {
      acc[handle] = value;
    }
    return acc;
  }, {});
}

async function parseIdMePayload(response: Response, fallbackIdToken?: unknown): Promise<JsonRecord | null> {
  const text = await response.text();
  if (!text) return decodeJwtPayload(fallbackIdToken);

  try {
    const parsed = JSON.parse(text);

    if (typeof parsed === 'string') {
      return decodeJwtPayload(parsed) || decodeJwtPayload(fallbackIdToken);
    }

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as JsonRecord;
      const attributeRecord = attributesArrayToRecord(record.attributes);
      return { ...record, ...attributeRecord };
    }
  } catch {
    return decodeJwtPayload(text) || decodeJwtPayload(fallbackIdToken);
  }

  return decodeJwtPayload(fallbackIdToken);
}

function getStringClaim(claims: JsonRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = claims[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header', request_id: requestId }, 401);
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
      console.error('Auth error:', { requestId, userError });
      return jsonResponse({ error: 'Unauthorized', request_id: requestId }, 401);
    }

    console.log('Processing ID.me verification for user:', { requestId, userId: user.id });

    const body = await parseJsonBody(req);
    const { action, code, redirect_uri } = body;

    // Allowlist redirect_uris to prevent OAuth authorization code theft.
    if (typeof redirect_uri !== 'string' || !ALLOWED_REDIRECT_URIS.has(redirect_uri)) {
      console.warn('Invalid ID.me redirect_uri:', { requestId, redirect_uri });
      return jsonResponse({
        error: 'Invalid redirect_uri',
        message: 'This application URL is not approved for ID.me verification.',
        request_id: requestId,
      }, 400);
    }

    // Action: get_auth_url - Generate the ID.me OAuth URL
    if (action === 'get_auth_url') {
      if (!IDME_CLIENT_ID) {
        return jsonResponse({
          error: 'ID.me not configured',
          message: 'IDME_CLIENT_ID secret is not set. Please configure ID.me credentials.',
          request_id: requestId,
        }, 503);
      }

      const state = crypto.randomUUID();
      const authUrl = `${endpoint('/oauth/authorize')}?` + new URLSearchParams({
        client_id: IDME_CLIENT_ID,
        redirect_uri: redirect_uri,
        response_type: 'code',
        scope: IDME_SCOPE,
        state: state,
      }).toString();

      console.log('Generated ID.me auth URL:', { requestId, scope: IDME_SCOPE, baseUrl: IDME_BASE_URL });

      return jsonResponse({
        auth_url: authUrl,
        state: state
      });
    }

    // Action: verify - Exchange code for token and verify
    if (action === 'verify') {
      if (!IDME_CLIENT_ID || !IDME_CLIENT_SECRET) {
        return jsonResponse({
          error: 'ID.me not configured',
          message: 'ID.me credentials are not set.',
          request_id: requestId,
        }, 503);
      }

      if (typeof code !== 'string' || !code.trim()) {
        return jsonResponse({ error: 'Missing authorization code', request_id: requestId }, 400);
      }

      console.log('Exchanging ID.me code for token:', { requestId });

      // Exchange code for token
      const tokenResponse = await fetch(endpoint('/oauth/token'), {
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
        console.error('ID.me token exchange failed:', { requestId, status: tokenResponse.status, errorText });
        return jsonResponse({
          error: 'Verification failed',
          message: 'Failed to verify with ID.me. Please try again.',
          request_id: requestId,
        }, 400);
      }

      const tokenData = await tokenResponse.json() as JsonRecord;
      const accessToken = getStringClaim(tokenData, 'access_token');
      if (!accessToken) {
        console.error('ID.me token exchange did not include an access token:', { requestId, tokenKeys: Object.keys(tokenData) });
        return jsonResponse({
          error: 'Verification failed',
          message: 'ID.me did not return a usable access token.',
          request_id: requestId,
        }, 400);
      }

      console.log('ID.me token received, fetching user info:', { requestId });

      // Get user info from ID.me. OIDC integrations return JSON user claims, while some
      // configurations return a JWT string; parse both so the profile update is not brittle.
      const userInfoResponse = await fetch(endpoint('/api/public/v3/userinfo'), {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!userInfoResponse.ok) {
        const errorText = await userInfoResponse.text();
        console.error('ID.me userinfo failed:', { requestId, status: userInfoResponse.status, errorText });
        return jsonResponse({
          error: 'Verification failed',
          message: 'Failed to get verification info from ID.me.',
          request_id: requestId,
        }, 400);
      }

      const userInfo = await parseIdMePayload(userInfoResponse, tokenData.id_token);
      if (!userInfo) {
        console.error('ID.me verification payload could not be parsed:', { requestId });
        return jsonResponse({
          error: 'Verification failed',
          message: 'ID.me returned a verification response this app could not parse.',
          request_id: requestId,
        }, 400);
      }

      const identityVerificationId = getStringClaim(userInfo, 'uuid', 'sub');
      if (!identityVerificationId) {
        console.error('ID.me verification payload did not include uuid/sub:', { requestId, claimKeys: Object.keys(userInfo) });
        return jsonResponse({
          error: 'Verification failed',
          message: 'ID.me did not return a stable identity identifier.',
          request_id: requestId,
        }, 400);
      }

      const verifiedAt = new Date().toISOString();
      console.log('ID.me verification successful for user:', { requestId, userId: user.id });

      // Update the user's profile with verification status
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          identity_verified: true,
          identity_verified_at: verifiedAt,
          identity_provider: 'id.me',
          identity_verification_id: identityVerificationId,
        })
        .eq('id', user.id);

      if (updateError) {
        console.error('Failed to update profile:', { requestId, updateError });
        return jsonResponse({
          error: 'Database error',
          message: 'Verification succeeded but failed to update profile.',
          request_id: requestId,
        }, 500);
      }

      return jsonResponse({
        success: true,
        verified: true,
        provider: 'id.me',
        verified_at: verifiedAt,
        request_id: requestId,
      });
    }

    return jsonResponse({ error: 'Invalid action', request_id: requestId }, 400);

  } catch (error: unknown) {
    console.error('Error in verify-identity-idme:', { requestId, error });
    return jsonResponse({
      error: 'Internal server error',
      message: 'Unexpected ID.me verification error. Please try again.',
      request_id: requestId,
    }, 500);
  }
});
