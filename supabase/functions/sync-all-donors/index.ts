import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Auth: internal/service callers (e.g. schedule-congress-donor-sync) present the
    // service-role key via x-internal-service-token (or the bearer) and skip the
    // admin-user check; everyone else must be a signed-in admin.
    const internalToken = req.headers.get('x-internal-service-token');
    const bearerToken = req.headers.get('Authorization')?.replace('Bearer ', '').trim();
    const isInternalService = (!!internalToken && internalToken === supabaseServiceKey)
      || (!!bearerToken && bearerToken === supabaseServiceKey);

    if (!isInternalService) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const adminCheckClient = createClient(supabaseUrl, supabaseServiceKey);
      const { data: roleData } = await adminCheckClient.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { cycle = '2024', limit = 50 } = await req.json().catch(() => ({}));
    
    console.log('[SYNC-ALL-DONORS] Starting batch donor sync for cycle:', cycle);

    // Get all candidates with FEC IDs
    const { data: candidates, error: fetchError } = await supabase
      .from('candidates')
      .select('id, name, fec_candidate_id, last_donor_sync')
      .not('fec_candidate_id', 'is', null)
      .order('last_donor_sync', { ascending: true, nullsFirst: true })
      .limit(limit);

    if (fetchError) {
      console.error('[SYNC-ALL-DONORS] Error fetching candidates:', fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[SYNC-ALL-DONORS] Found', candidates?.length || 0, 'candidates with FEC IDs');

    if (!candidates || candidates.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          processed: 0, 
          message: 'No candidates with FEC IDs found' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = {
      success: 0,
      failed: 0,
      totalDonorsImported: 0,
      totalRaised: 0,
      errors: [] as string[],
    };

    const fetchFecDonorsUrl = `${supabaseUrl}/functions/v1/fetch-fec-donors`;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Process each candidate
    for (const candidate of candidates) {
      try {
        console.log('[SYNC-ALL-DONORS] Processing:', candidate.name);

        // Call fetch-fec-donors via direct fetch with the service-role bearer token.
        // fetch-fec-donors recognizes the service-role key and skips its admin/user check.
        const resp = await fetch(fetchFecDonorsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'apikey': anonKey,
          },
          body: JSON.stringify({
            candidateId: candidate.id,
            fecCandidateId: candidate.fec_candidate_id,
            cycle,
          }),
        });

        const data = await resp.json().catch(() => ({}));

        if (!resp.ok) {
          console.error('[SYNC-ALL-DONORS] HTTP', resp.status, 'for', candidate.name, ':', data);
          results.failed++;
          results.errors.push(`${candidate.name}: HTTP ${resp.status} ${data?.error || ''}`.trim());
        } else if (data?.success) {
          results.success++;
          results.totalDonorsImported += data.imported || 0;
          results.totalRaised += data.totalRaised || 0;
          console.log('[SYNC-ALL-DONORS] Success for', candidate.name, ':', data.imported, 'donors');
        } else {
          results.failed++;
          results.errors.push(`${candidate.name}: ${data?.error || 'Unknown error'}`);
        }

        // Rate limit: wait 1 second between requests
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (err) {
        console.error('[SYNC-ALL-DONORS] Exception for', candidate.name, ':', err);
        results.failed++;
        results.errors.push(`${candidate.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    console.log('[SYNC-ALL-DONORS] Complete:', results);

    return new Response(
      JSON.stringify({
        processed: candidates.length,
        successCount: results.success,
        failedCount: results.failed,
        totalDonorsImported: results.totalDonorsImported,
        totalRaised: results.totalRaised,
        errors: results.errors,
        message: `Synced ${results.success}/${candidates.length} candidates. Imported ${results.totalDonorsImported} donors totaling $${results.totalRaised.toLocaleString()}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[SYNC-ALL-DONORS] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
