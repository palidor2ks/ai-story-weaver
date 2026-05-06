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

    // Admin auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const adminCheckClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: roleData } = await adminCheckClient.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }


  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting conduit_committee_id backfill...');

    // Get count of transfers without conduit_committee_id in donors table
    const { count: donorsBefore } = await supabase
      .from('donors')
      .select('*', { count: 'exact', head: true })
      .eq('is_transfer', true)
      .is('conduit_committee_id', null);

    console.log(`Found ${donorsBefore} donors transfers without conduit_committee_id`);

    // Get count of transfers without conduit_committee_id in contributions table
    const { count: contributionsBefore } = await supabase
      .from('contributions')
      .select('*', { count: 'exact', head: true })
      .eq('is_transfer', true)
      .is('conduit_committee_id', null);

    console.log(`Found ${contributionsBefore} contribution transfers without conduit_committee_id`);

    // Get all candidate_committees for matching
    const { data: committees, error: committeesError } = await supabase
      .from('candidate_committees')
      .select('fec_committee_id, name')
      .not('name', 'is', null);

    if (committeesError) {
      throw new Error(`Failed to fetch committees: ${committeesError.message}`);
    }

    console.log(`Found ${committees?.length || 0} committees for matching`);

    // Create a map of committee names to FEC IDs
    const committeeMap = new Map<string, string>();
    for (const c of committees || []) {
      if (c.name && c.fec_committee_id) {
        committeeMap.set(c.name.toUpperCase(), c.fec_committee_id);
      }
    }

    // Update donors in batches
    let donorsUpdated = 0;
    const { data: donorTransfers, error: donorError } = await supabase
      .from('donors')
      .select('id, name')
      .eq('is_transfer', true)
      .is('conduit_committee_id', null);

    if (donorError) {
      console.error('Error fetching donor transfers:', donorError);
    } else if (donorTransfers) {
      for (const donor of donorTransfers) {
        const matchedCommitteeId = committeeMap.get(donor.name?.toUpperCase() || '');
        if (matchedCommitteeId) {
          const { error: updateError } = await supabase
            .from('donors')
            .update({ conduit_committee_id: matchedCommitteeId })
            .eq('id', donor.id);

          if (!updateError) {
            donorsUpdated++;
          }
        }
      }
    }

    console.log(`Updated ${donorsUpdated} donors with conduit_committee_id`);

    // Update contributions in batches
    let contributionsUpdated = 0;
    const { data: contributionTransfers, error: contribError } = await supabase
      .from('contributions')
      .select('id, contributor_name')
      .eq('is_transfer', true)
      .is('conduit_committee_id', null);

    if (contribError) {
      console.error('Error fetching contribution transfers:', contribError);
    } else if (contributionTransfers) {
      // Process in batches of 100 to avoid timeouts
      const batchSize = 100;
      for (let i = 0; i < contributionTransfers.length; i += batchSize) {
        const batch = contributionTransfers.slice(i, i + batchSize);
        
        for (const contrib of batch) {
          const matchedCommitteeId = committeeMap.get(contrib.contributor_name?.toUpperCase() || '');
          if (matchedCommitteeId) {
            const { error: updateError } = await supabase
              .from('contributions')
              .update({ conduit_committee_id: matchedCommitteeId })
              .eq('id', contrib.id);

            if (!updateError) {
              contributionsUpdated++;
            }
          }
        }
      }
    }

    console.log(`Updated ${contributionsUpdated} contributions with conduit_committee_id`);

    const result = {
      success: true,
      donors: {
        before: donorsBefore || 0,
        updated: donorsUpdated,
        remaining: (donorsBefore || 0) - donorsUpdated
      },
      contributions: {
        before: contributionsBefore || 0,
        updated: contributionsUpdated,
        remaining: (contributionsBefore || 0) - contributionsUpdated
      },
      message: `Backfill complete. Updated ${donorsUpdated} donors and ${contributionsUpdated} contributions.`
    };

    console.log('Backfill complete:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: unknown) {
    console.error('Backfill error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
